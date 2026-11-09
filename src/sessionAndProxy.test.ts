import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as signInHandler } from '../functions/api/auth/sign-in';
import { onRequestGet as sessionHandler } from '../functions/api/auth/session';
import { onRequestPost as signOutHandler } from '../functions/api/auth/sign-out';
import { onRequestPost as adoptHandler } from '../functions/api/auth/adopt';
import { onRequest as proxyHandler } from '../functions/api/supabase/[[path]]';

const testEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
};

describe('Phase 1: First-Party Auth Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('/api/auth/sign-in', () => {
    it('rejects requests with invalid origin with 403', async () => {
      const req = new Request('https://pulse.video/api/auth/sign-in', {
        method: 'POST',
        headers: { origin: 'https://evil.attacker.com' },
        body: JSON.stringify({ email: 'user@example.com', password: 'password123' }),
      });

      const res = await signInHandler({ request: req, env: testEnv });
      expect(res.status).toBe(403);
      const data = await res.json() as { error: string };
      expect(data.error).toBe('Invalid origin');
    });

    it('authenticates with Supabase and returns HttpOnly cookies with NO tokens in body', async () => {
      // Mock Supabase Auth password token endpoint
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/auth/v1/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'secret-access-token-123',
              refresh_token: 'secret-refresh-token-456',
              expires_in: 3600,
              user: { id: 'user-id-99', email: 'fan@example.com' },
            }),
            { status: 200 }
          );
        }
        if (url.includes('/rest/v1/subscriptions')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.video/api/auth/sign-in', {
        method: 'POST',
        headers: {
          origin: 'https://pulse.video',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'fan@example.com', password: 'securePassword!' }),
      });

      const res = await signInHandler({ request: req, env: testEnv });
      expect(res.status).toBe(200);

      // Verify Set-Cookie headers
      const setCookies = res.headers.getSetCookie();
      expect(setCookies.length).toBeGreaterThanOrEqual(3);

      const cookieStr = setCookies.join('\n');
      expect(cookieStr).toContain('__Host-pulse_access=secret-access-token-123');
      expect(cookieStr).toContain('HttpOnly');
      expect(cookieStr).toContain('Secure');
      expect(cookieStr).toContain('__Host-pulse_refresh=secret-refresh-token-456');

      // CRITICAL SECURITY ASSERTION: Response body MUST NOT contain access_token or refresh_token
      const body = await res.json() as Record<string, unknown>;
      expect(body).not.toHaveProperty('access_token');
      expect(body).not.toHaveProperty('refresh_token');
      expect(body).not.toHaveProperty('tokens');
      expect(body.user).toEqual({ id: 'user-id-99', email: 'fan@example.com' });
      expect(body.tier).toBe('free');
      expect(body.csrfToken).toBeTruthy();
    });
  });

  describe('/api/auth/session', () => {
    it('returns anonymous when no cookies are provided', async () => {
      const req = new Request('https://pulse.video/api/auth/session', {
        method: 'GET',
      });

      const res = await sessionHandler({ request: req, env: testEnv });
      expect(res.status).toBe(200);
      const body = await res.json() as { user: null; tier: string; csrfToken: null };
      expect(body.user).toBeNull();
      expect(body.tier).toBe('anonymous');
      expect(body.csrfToken).toBeNull();
    });

    it('returns user and rotates tokens when access token is expired but refresh token is valid', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) {
          // Access token expired
          return new Response(JSON.stringify({ message: 'Token expired' }), { status: 401 });
        }
        if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
          return new Response(
            JSON.stringify({
              access_token: 'new-access-token-789',
              refresh_token: 'new-refresh-token-012',
              expires_in: 3600,
              user: { id: 'user-id-99', email: 'fan@example.com' },
            }),
            { status: 200 }
          );
        }
        if (url.includes('/rest/v1/subscriptions')) {
          return new Response(
            JSON.stringify([{ status: 'active', expires_at: new Date(Date.now() + 86400000).toISOString() }]),
            { status: 200 }
          );
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.video/api/auth/session', {
        method: 'GET',
        headers: {
          cookie: '__Host-pulse_access=expired-jwt; __Host-pulse_refresh=valid-refresh-token',
        },
      });

      const res = await sessionHandler({ request: req, env: testEnv });
      expect(res.status).toBe(200);

      const setCookies = res.headers.getSetCookie().join('\n');
      expect(setCookies).toContain('__Host-pulse_access=new-access-token-789');
      expect(setCookies).toContain('__Host-pulse_refresh=new-refresh-token-012');

      const body = await res.json() as Record<string, unknown>;
      expect(body).not.toHaveProperty('access_token');
      expect(body.tier).toBe('pro');
    });
  });

  describe('/api/auth/adopt', () => {
    it('adopts legacy session, sets HttpOnly cookies, and returns no token material in body', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({ id: 'legacy-user-1', email: 'migrated@example.com' }),
            { status: 200 }
          );
        }
        if (url.includes('/rest/v1/subscriptions')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.video/api/auth/adopt', {
        method: 'POST',
        headers: {
          origin: 'https://pulse.video',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: 'legacy-access-token',
          refresh_token: 'legacy-refresh-token',
        }),
      });

      const res = await adoptHandler({ request: req, env: testEnv });
      expect(res.status).toBe(200);

      const setCookies = res.headers.getSetCookie().join('\n');
      expect(setCookies).toContain('__Host-pulse_access=legacy-access-token');
      expect(setCookies).toContain('__Host-pulse_refresh=legacy-refresh-token');

      const body = await res.json() as Record<string, unknown>;
      expect(body).not.toHaveProperty('access_token');
      expect(body).not.toHaveProperty('refresh_token');
      expect(body.user).toEqual({ id: 'legacy-user-1', email: 'migrated@example.com' });
    });
  });

  describe('/api/auth/sign-out', () => {
    it('expires every auth cookie and calls Supabase logout', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

      const req = new Request('https://pulse.video/api/auth/sign-out', {
        method: 'POST',
        headers: {
          origin: 'https://pulse.video',
          cookie: '__Host-pulse_access=active-jwt; __Host-pulse_refresh=active-refresh',
        },
      });

      const res = await signOutHandler({ request: req, env: testEnv });
      expect(res.status).toBe(200);

      const setCookies = res.headers.getSetCookie().join('\n');
      expect(setCookies).toContain('__Host-pulse_access=;');
      expect(setCookies).toContain('Max-Age=0');
      expect(setCookies).toContain('__Host-pulse_refresh=;');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/auth/v1/logout'),
        expect.anything()
      );
    });
  });

  describe('/api/supabase/[[path]] Proxy', () => {
    it('rejects unauthorized paths such as auth/v1 and admin with 403', async () => {
      const req = new Request('https://pulse.video/api/supabase/auth/v1/user', {
        method: 'GET',
      });

      const res = await proxyHandler({
        request: req,
        env: testEnv,
        params: { path: ['auth', 'v1', 'user'] },
      });
      expect(res.status).toBe(403);
    });

    it('rejects requests without valid session cookies with 401', async () => {
      const req = new Request('https://pulse.video/api/supabase/rest/v1/likes', {
        method: 'GET',
      });

      const res = await proxyHandler({
        request: req,
        env: testEnv,
        params: { path: ['rest', 'v1', 'likes'] },
      });
      expect(res.status).toBe(401);
    });

    it('rejects state-changing requests without CSRF verification with 403', async () => {
      const req = new Request('https://pulse.video/api/supabase/rest/v1/likes', {
        method: 'POST',
        headers: {
          cookie: '__Host-pulse_access=valid-token; __Host-pulse_csrf=csrf-1',
          origin: 'https://pulse.video',
          'x-csrf-token': 'wrong-csrf',
        },
      });

      const res = await proxyHandler({
        request: req,
        env: testEnv,
        params: { path: ['rest', 'v1', 'likes'] },
      });
      expect(res.status).toBe(403);
    });

    it('forwards valid authenticated requests to Supabase PostgREST with user Bearer token and strips client cookies', async () => {
      const csrf = 'matching-csrf-token-123';

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        const headers = init?.headers as Headers;

        if (url.includes('/auth/v1/user')) {
          return new Response(JSON.stringify({ id: 'user-77', email: 'user@example.com' }), { status: 200 });
        }
        if (url.includes('/rest/v1/subscriptions')) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url.includes('/rest/v1/likes')) {
          // Verify headers received by upstream Supabase PostgREST
          expect(headers.get('apikey')).toBe(testEnv.SUPABASE_ANON_KEY);
          expect(headers.get('Authorization')).toBe('Bearer my-valid-access-jwt');
          expect(headers.has('cookie')).toBe(false);

          return new Response(JSON.stringify({ success: true }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.video/api/supabase/rest/v1/likes?select=*', {
        method: 'POST',
        headers: {
          origin: 'https://pulse.video',
          cookie: `__Host-pulse_access=my-valid-access-jwt; __Host-pulse_csrf=${csrf}`,
          'x-csrf-token': csrf,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ video_id: 'vid-1' }),
      });

      const res = await proxyHandler({
        request: req,
        env: testEnv,
        params: { path: ['rest', 'v1', 'likes'] },
      });

      expect(res.status).toBe(201);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });
});
