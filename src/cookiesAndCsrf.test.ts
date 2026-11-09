import { describe, it, expect } from 'vitest';
import {
  parseCookies,
  serializeCookie,
  buildAuthCookieHeaders,
  buildClearAuthCookieHeaders,
  isSecureContext,
} from '../functions/_lib/cookies';
import {
  generateCsrfToken,
  verifyCsrf,
} from '../functions/_lib/csrf';

describe('Phase 1: Cookie Security Policies', () => {
  it('serializes cookies with all production security attributes', () => {
    const serialized = serializeCookie('__Host-pulse_access', 'jwt-test-token', {
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 3600,
    });

    expect(serialized).toContain('__Host-pulse_access=jwt-test-token');
    expect(serialized).toContain('Path=/');
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Secure');
    expect(serialized).toContain('SameSite=Strict');
    expect(serialized).toContain('Max-Age=3600');
  });

  it('builds auth cookie headers with __Host- prefix in secure environments', () => {
    const headers = buildAuthCookieHeaders({
      accessToken: 'access-jwt-val',
      refreshToken: 'refresh-token-val',
      csrfToken: 'csrf-token-val',
      expiresInSeconds: 1800,
      isSecure: true,
    });

    expect(headers).toHaveLength(3);

    // 1. Access cookie: HttpOnly, Secure, 1800s
    expect(headers[0]).toContain('__Host-pulse_access=access-jwt-val');
    expect(headers[0]).toContain('HttpOnly');
    expect(headers[0]).toContain('Secure');
    expect(headers[0]).toContain('Max-Age=1800');

    // 2. Refresh cookie: HttpOnly, Secure, 30 days (2592000s)
    expect(headers[1]).toContain('__Host-pulse_refresh=refresh-token-val');
    expect(headers[1]).toContain('HttpOnly');
    expect(headers[1]).toContain('Secure');
    expect(headers[1]).toContain('Max-Age=2592000');

    // 3. CSRF cookie: readable by JS (NOT HttpOnly), Secure, SameSite=Strict
    expect(headers[2]).toContain('__Host-pulse_csrf=csrf-token-val');
    expect(headers[2]).not.toContain('HttpOnly');
    expect(headers[2]).toContain('Secure');
    expect(headers[2]).toContain('SameSite=Strict');
  });

  it('builds clear cookie headers with Max-Age=0', () => {
    const clearHeaders = buildClearAuthCookieHeaders(true);
    for (const h of clearHeaders) {
      expect(h).toContain('Max-Age=0');
      expect(h).toContain('Path=/');
    }
    const headerStr = clearHeaders.join('\n');
    expect(headerStr).toContain('__Host-pulse_access=;');
    expect(headerStr).toContain('__Host-pulse_refresh=;');
    expect(headerStr).toContain('__Host-pulse_csrf=;');
  });

  it('correctly parses request Cookie header', () => {
    const req = new Request('https://pulse.video', {
      headers: {
        cookie: '__Host-pulse_access=abc; __Host-pulse_refresh=def; theme=dark',
      },
    });

    const parsed = parseCookies(req);
    expect(parsed['__Host-pulse_access']).toBe('abc');
    expect(parsed['__Host-pulse_refresh']).toBe('def');
    expect(parsed['theme']).toBe('dark');
    expect(parsed['nonexistent']).toBeUndefined();
  });

  it('identifies secure context on deployed hostnames vs insecure localhost', () => {
    const prodReq = new Request('https://pulse.video/api/auth/session');
    expect(isSecureContext(prodReq)).toBe(true);

    const localHttpReq = new Request('http://localhost:5173/api/auth/session');
    expect(isSecureContext(localHttpReq)).toBe(false);

    const localHttpsReq = new Request('https://localhost:5173/api/auth/session');
    expect(isSecureContext(localHttpsReq)).toBe(true);
  });
});

describe('Phase 1: CSRF & Origin Verification', () => {
  it('generates a 64-character cryptographically secure hex token', () => {
    const t1 = generateCsrfToken();
    const t2 = generateCsrfToken();
    expect(t1).toHaveLength(64);
    expect(t2).toHaveLength(64);
    expect(t1).not.toBe(t2);
    expect(/^[0-9a-f]{64}$/.test(t1)).toBe(true);
  });

  it('allows safe methods (GET, HEAD, OPTIONS) without CSRF tokens', () => {
    const req = new Request('https://pulse.video/api/auth/session', { method: 'GET' });
    expect(verifyCsrf(req).valid).toBe(true);
  });

  it('rejects state-changing requests with invalid or missing Origin', () => {
    // Missing Origin and Referer
    const req1 = new Request('https://pulse.video/api/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    expect(verifyCsrf(req1).valid).toBe(false);

    // Mismatched Origin
    const req2 = new Request('https://pulse.video/api/auth/sign-in', {
      method: 'POST',
      headers: { origin: 'https://malicious-site.example' },
      body: JSON.stringify({}),
    });
    expect(verifyCsrf(req2).valid).toBe(false);
  });

  it('rejects state-changing requests when CSRF token is missing or mismatched', () => {
    const validOrigin = 'https://pulse.video';

    // Origin matches, but no CSRF headers/cookies
    const req1 = new Request('https://pulse.video/api/auth/sign-in', {
      method: 'POST',
      headers: { origin: validOrigin },
      body: JSON.stringify({}),
    });
    expect(verifyCsrf(req1).valid).toBe(false);

    // Mismatched header vs cookie
    const req2 = new Request('https://pulse.video/api/auth/sign-in', {
      method: 'POST',
      headers: {
        origin: validOrigin,
        cookie: '__Host-pulse_csrf=token-aaa',
        'x-csrf-token': 'token-bbb',
      },
      body: JSON.stringify({}),
    });
    expect(verifyCsrf(req2).valid).toBe(false);
  });

  it('accepts state-changing requests with matching Origin and double-submit CSRF token', () => {
    const validOrigin = 'https://pulse.video';
    const csrf = 'my-valid-csrf-token-12345';

    const req = new Request('https://pulse.video/api/auth/sign-in', {
      method: 'POST',
      headers: {
        origin: validOrigin,
        cookie: `__Host-pulse_csrf=${csrf}`,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({}),
    });

    const result = verifyCsrf(req);
    expect(result.valid).toBe(true);
  });
});
