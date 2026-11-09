import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';

// Server-side modules under test
import { SECURITY_HEADERS, jsonResponse, errorResponse } from '../functions/_lib/http';
import {
  sanitizeString,
  sanitizeData,
  sanitizeHeaders,
  safeLog,
  safeWarn,
  safeError,
} from '../functions/_lib/logger';
import {
  checkRateLimit,
  buildRateLimitResponse,
  getClientIp,
  _resetRateLimitStore,
} from '../functions/_lib/rateLimit';

// Endpoints under test
import { onRequestPost as handleSignIn } from '../functions/api/auth/sign-in';
import { onRequestPost as handleAgeVerify } from '../functions/api/age/verify';

// PrivacyScreen component under test
import { PrivacyScreen } from './components/PrivacyScreen';

describe('Phase 7: Security and Privacy Hardening', () => {
  beforeEach(() => {
    _resetRateLimitStore();
    vi.restoreAllMocks();
  });

  describe('1. Edge Response Headers & Content Security Policy', () => {
    it('defines standard security headers with clickjacking and sniffing protection', () => {
      expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
      expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
      expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('microphone=()');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('geolocation=()');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('https://js.paystack.co');
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain('https://checkout.stripe.com');
    });

    it('enforces strict CSP without unsafe-eval and with constrained script sources', () => {
      const csp = SECURITY_HEADERS['Content-Security-Policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("script-src 'self' https://js.paystack.co");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain('https://*.supabase.co');
      expect(csp).toContain('https://checkout.stripe.com');
    });

    it('jsonResponse and errorResponse attach all security headers by default', () => {
      const res = jsonResponse({ ok: true });
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
      expect(res.headers.get('Cache-Control')).toContain('no-store');

      const errRes = errorResponse('Bad Request', 400);
      expect(errRes.status).toBe(400);
      expect(errRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(errRes.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('verifies public/_headers file exists and mirrors edge security headers', () => {
      const headersPath = path.resolve(process.cwd(), 'public/_headers');
      expect(fs.existsSync(headersPath)).toBe(true);

      const content = fs.readFileSync(headersPath, 'utf-8');
      expect(content).toContain('X-Content-Type-Options: nosniff');
      expect(content).toContain('X-Frame-Options: DENY');
      expect(content).toContain('Referrer-Policy: strict-origin-when-cross-origin');
      expect(content).toContain('frame-ancestors \'none\'');
      expect(content).toContain('/api/*');
      expect(content).toContain('Cache-Control: no-store');
    });
  });

  describe('2. Log Sanitization and Redaction', () => {
    it('redacts sensitive string patterns (Bearer tokens, cookies, phones, cards)', () => {
      const input =
        'Authorization: Bearer secret_jwt_token_12345; Cookie: __Host-pulse_access=token123; Contact: 0241234567; Card: 4111 2222 3333 4444';
      const sanitized = sanitizeString(input);

      expect(sanitized).toContain('Bearer [REDACTED]');
      expect(sanitized).not.toContain('secret_jwt_token_12345');
      expect(sanitized).toContain('__Host-pulse_access=[REDACTED]');
      expect(sanitized).not.toContain('token123');
      expect(sanitized).toContain('[REDACTED_PHONE]');
      expect(sanitized).not.toContain('0241234567');
      expect(sanitized).toContain('[REDACTED_CARD]');
      expect(sanitized).not.toContain('4111 2222 3333 4444');
    });

    it('redacts sensitive fields in nested objects and arrays while preserving safe metadata', () => {
      const sensitiveObj = {
        userId: 'usr-123',
        email: 'user@example.com',
        password: 'SuperSecretPassword!',
        token: 'eyJhbGciOi...',
        profile: {
          phone: '+233241234567',
          cvv: '123',
          pin: '9999',
          displayName: 'Kwame',
        },
        items: [
          { apiKey: 'secret-key-1', label: 'Item 1' },
          { secret: 'very-secret', label: 'Item 2' },
        ],
      };

      const result = sanitizeData(sensitiveObj);

      expect(result.userId).toBe('usr-123');
      expect(result.email).toBe('user@example.com');
      expect(result.password).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.profile.displayName).toBe('Kwame');
      expect(result.profile.phone).toBe('[REDACTED]');
      expect(result.profile.cvv).toBe('[REDACTED]');
      expect(result.profile.pin).toBe('[REDACTED]');
      expect(result.items[0].apiKey).toBe('[REDACTED]');
      expect(result.items[0].label).toBe('Item 1');
      expect(result.items[1].secret).toBe('[REDACTED]');
    });

    it('handles circular references without infinite loops', () => {
      const circular: Record<string, unknown> = { name: 'Root' };
      circular.self = circular;

      const sanitized = sanitizeData(circular);
      expect(sanitized.name).toBe('Root');
      expect(sanitized.self).toBe('[CIRCULAR]');
    });

    it('sanitizes HTTP Headers object and maps', () => {
      const headers = new Headers();
      headers.set('Authorization', 'Bearer secret-bearer');
      headers.set('Cookie', '__Host-pulse_access=abc; age_verified=xyz');
      headers.set('Content-Type', 'application/json');

      const sanitized = sanitizeHeaders(headers);
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
    });

    it('safeLog, safeWarn, and safeError do not throw and pass sanitized data to console', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      safeLog('test:tag', 'User action', { password: '123', user: 'alice' });
      expect(logSpy).toHaveBeenCalledWith('[test:tag] User action', {
        password: '[REDACTED]',
        user: 'alice',
      });

      safeWarn('test:warn', 'Warning raised', { pin: '4321' });
      expect(warnSpy).toHaveBeenCalledWith('[test:warn] Warning raised', {
        pin: '[REDACTED]',
      });

      safeError('test:err', 'An error occurred', new Error('Failed with password=123'));
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('3. Edge Rate Limiter Engine', () => {
    it('allows requests within the configured sliding window threshold', async () => {
      const config = { maxRequests: 3, windowSeconds: 60 };

      const r1 = await checkRateLimit('ip:1', config);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(2);

      const r2 = await checkRateLimit('ip:1', config);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(1);

      const r3 = await checkRateLimit('ip:1', config);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    it('blocks requests exceeding the threshold with 429 semantics', async () => {
      const config = { maxRequests: 2, windowSeconds: 60 };

      await checkRateLimit('ip:2', config);
      await checkRateLimit('ip:2', config);

      const blocked = await checkRateLimit('ip:2', config);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetSeconds).toBeGreaterThan(0);

      const response = buildRateLimitResponse(blocked);
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe(String(blocked.resetSeconds));
      expect(response.headers.get('X-RateLimit-Limit')).toBe('2');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');

      const body = await response.json();
      expect(body.error).toContain('Too many requests');
    });

    it('isolates different keys independently', async () => {
      const config = { maxRequests: 1, windowSeconds: 60 };

      const rUserA = await checkRateLimit('user:a', config);
      expect(rUserA.allowed).toBe(true);

      const rUserABlocked = await checkRateLimit('user:a', config);
      expect(rUserABlocked.allowed).toBe(false);

      const rUserB = await checkRateLimit('user:b', config);
      expect(rUserB.allowed).toBe(true);
    });

    it('extracts IP correctly from headers', () => {
      const reqCf = new Request('http://localhost', {
        headers: { 'cf-connecting-ip': '203.0.113.195' },
      });
      expect(getClientIp(reqCf)).toBe('203.0.113.195');

      const reqForwarded = new Request('http://localhost', {
        headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' },
      });
      expect(getClientIp(reqForwarded)).toBe('198.51.100.1');

      const reqDefault = new Request('http://localhost');
      expect(getClientIp(reqDefault)).toBe('127.0.0.1');
    });
  });

  describe('4. Rate Limiting Protection on Sensitive Endpoints', () => {
    it('rate limits /api/auth/sign-in after 5 requests per IP', async () => {
      const env = {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_ANON_KEY: 'test-anon-key',
      };

      const makeReq = () =>
        new Request('https://pulse.app/api/auth/sign-in', {
          method: 'POST',
          headers: {
            Origin: 'https://pulse.app',
            'cf-connecting-ip': '1.2.3.4',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'bad@user.com', password: 'wrongpassword' }),
        });

      // Mock upstream supabase failure
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error_description: 'Invalid credentials' }), { status: 400 })
      );

      // 5 requests pass through to auth check (status 400 or 401)
      for (let i = 0; i < 5; i++) {
        const res = await handleSignIn({ request: makeReq(), env });
        expect(res.status).not.toBe(429);
      }

      // 6th request is rate-limited at edge
      const blockedRes = await handleSignIn({ request: makeReq(), env });
      expect(blockedRes.status).toBe(429);
      expect(blockedRes.headers.get('Retry-After')).toBeDefined();
    });

    it('rate limits /api/age/verify after 10 requests per IP', async () => {
      const env = {};
      const makeReq = () =>
        new Request('https://pulse.app/api/age/verify', {
          method: 'POST',
          headers: {
            Origin: 'https://pulse.app',
            'cf-connecting-ip': '5.6.7.8',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ declaredOver18: true }),
        });

      // 10 requests succeed
      for (let i = 0; i < 10; i++) {
        const res = await handleAgeVerify({ request: makeReq(), env });
        expect(res.status).toBe(200);
      }

      // 11th request is blocked with 429
      const blockedRes = await handleAgeVerify({ request: makeReq(), env });
      expect(blockedRes.status).toBe(429);
      const json = await blockedRes.json();
      expect(json.error).toContain('Too many requests');
    });
  });

  describe('5. Service Worker Network-Only Caching Configuration', () => {
    it('verifies vite.config.ts configures navigateFallbackDenylist and NetworkOnly for /api/', () => {
      const configPath = path.resolve(process.cwd(), 'vite.config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');

      expect(content).toContain('navigateFallbackDenylist');
      expect(content).toContain('/^\\/api\\//');
      expect(content).toContain('/^\\/watch\\//');
      expect(content).toContain("handler: 'NetworkOnly'");
    });
  });

  describe('6. Privacy Screen Documentation and Transparency', () => {
    it('renders the 24-hour anonymous retention, zero-PII age verification, and account sync sections', () => {
      render(<PrivacyScreen onBack={() => {}} />);

      // Section 1: Guest Browsing & 24-Hour Local Retention
      expect(screen.getByText(/1\. Guest Browsing & 24-Hour Local Retention/i)).toBeInTheDocument();
      expect(screen.getByText(/24-Hour Expiration/i)).toBeInTheDocument();
      expect(screen.getByText(/Zero Surveillance/i)).toBeInTheDocument();

      // Section 2: Zero-PII Age Verification
      expect(screen.getByText(/2\. Zero-PII Age Verification/i)).toBeInTheDocument();
      expect(screen.getByText(/Zero Personal Information/i)).toBeInTheDocument();
      expect(screen.getByText(/Private Segregated Media/i)).toBeInTheDocument();

      // Section 3: Seamless Account Synchronization
      expect(screen.getByText(/3\. Seamless Account Synchronization/i)).toBeInTheDocument();
      expect(screen.getByText(/Instant Local Purge/i)).toBeInTheDocument();

      // Section 6: Ghana Data Protection Act 2012
      expect(screen.getByText(/Ghana Data Protection Act 2012/i)).toBeInTheDocument();
      expect(screen.getByText(/Machine-Readable Export/i)).toBeInTheDocument();
      expect(screen.getByText(/Permanent Deletion/i)).toBeInTheDocument();
    });
  });
});
