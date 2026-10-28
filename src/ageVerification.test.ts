import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateAgeToken,
  saveAgeVerification,
  verifyAgeToken,
  revokeAgeVerification,
  getAgeTokenFromRequest,
  buildAgeCookieHeader,
  buildClearAgeCookieHeader,
  _resetAgeMemoryStore,
  AGE_COOKIE_NAME,
  AGE_TTL_SECONDS,
} from '../functions/_lib/ageVerification';
import { onRequestGet as handleAgeStatus } from '../functions/api/age/status';
import { onRequestPost as handleAgeVerify } from '../functions/api/age/verify';
import { onRequestGet as handleRestrictedMedia } from '../functions/api/media/restricted/[id]';
import { ageVerificationService } from './services/ageVerification';

describe('Phase 3: Age Verification & Media Isolation', () => {
  beforeEach(() => {
    _resetAgeMemoryStore();
    ageVerificationService.resetForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    _resetAgeMemoryStore();
  });

  describe('Token Generation & Store Operations', () => {
    it('generates a 32-byte (64 hex characters) opaque token', () => {
      const token = generateAgeToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('stores and validates a valid age verification token', async () => {
      const token = generateAgeToken();
      expect(await verifyAgeToken(token)).toBe(false);

      await saveAgeVerification(token);
      expect(await verifyAgeToken(token)).toBe(true);
    });

    it('revokes an age verification token', async () => {
      const token = generateAgeToken();
      await saveAgeVerification(token);
      expect(await verifyAgeToken(token)).toBe(true);

      await revokeAgeVerification(token);
      expect(await verifyAgeToken(token)).toBe(false);
    });

    it('rejects malformed or empty tokens', async () => {
      expect(await verifyAgeToken('')).toBe(false);
      expect(await verifyAgeToken(null)).toBe(false);
      expect(await verifyAgeToken('not-a-hex-token')).toBe(false);
      expect(await verifyAgeToken('12345')).toBe(false);
    });

    it('expires tokens after TTL has passed', async () => {
      const token = generateAgeToken();
      // Save with 1 second TTL
      await saveAgeVerification(token, undefined, 1);
      expect(await verifyAgeToken(token)).toBe(true);

      // Advance clock past 1 second
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 2000);

      expect(await verifyAgeToken(token)).toBe(false);
    });

    it('builds exact Set-Cookie header matching the specification', () => {
      const token = generateAgeToken();
      const header = buildAgeCookieHeader(token, true);

      expect(header).toContain(`${AGE_COOKIE_NAME}=${token}`);
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
      expect(header).toContain('SameSite=Strict');
      expect(header).toContain('Path=/');
      expect(header).toContain(`Max-Age=${AGE_TTL_SECONDS}`);
    });

    it('builds clear cookie header with Max-Age=0', () => {
      const header = buildClearAgeCookieHeader(true);
      expect(header).toContain(`${AGE_COOKIE_NAME}=;`);
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Secure');
    });

    it('extracts age token from request cookies', () => {
      const token = generateAgeToken();
      const req = new Request('https://pulse.example/api/age/status', {
        headers: {
          Cookie: `unrelated=123; ${AGE_COOKIE_NAME}=${token}; other=456`,
        },
      });

      expect(getAgeTokenFromRequest(req)).toBe(token);
    });

    it('works seamlessly with Cloudflare KV interface when provided', async () => {
      const kvStore = new Map<string, string>();
      const mockKv = {
        get: vi.fn(async (key: string) => kvStore.get(key) || null),
        put: vi.fn(async (key: string, val: string) => {
          kvStore.set(key, val);
        }),
        delete: vi.fn(async (key: string) => {
          kvStore.delete(key);
        }),
      };

      const token = generateAgeToken();
      await saveAgeVerification(token, mockKv);
      expect(mockKv.put).toHaveBeenCalledWith(
        `age:${token}`,
        expect.stringContaining('"declaredOver18":true'),
        { expirationTtl: AGE_TTL_SECONDS }
      );

      const isValid = await verifyAgeToken(token, mockKv);
      expect(isValid).toBe(true);
      expect(mockKv.get).toHaveBeenCalledWith(`age:${token}`);

      await revokeAgeVerification(token, mockKv);
      expect(mockKv.delete).toHaveBeenCalledWith(`age:${token}`);
    });
  });

  describe('Edge Endpoint: GET /api/age/status', () => {
    it('returns verified: false when no cookie is present', async () => {
      const req = new Request('https://pulse.example/api/age/status');
      const res = await handleAgeStatus({ request: req, env: {} });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ verified: false });
      expect(res.headers.get('Cache-Control')).toContain('no-store');
    });

    it('returns verified: true when a valid token is present in cookies', async () => {
      const token = generateAgeToken();
      await saveAgeVerification(token);

      const req = new Request('https://pulse.example/api/age/status', {
        headers: {
          Cookie: `${AGE_COOKIE_NAME}=${token}`,
        },
      });
      const res = await handleAgeStatus({ request: req, env: {} });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ verified: true });
    });
  });

  describe('Edge Endpoint: POST /api/age/verify', () => {
    it('rejects cross-origin requests with 403', async () => {
      const req = new Request('https://pulse.example/api/age/verify', {
        method: 'POST',
        headers: {
          Origin: 'https://malicious.evil.com',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ declaredOver18: true }),
      });

      const res = await handleAgeVerify({ request: req, env: {} });
      expect(res.status).toBe(403);
    });

    it('rejects invalid or missing affirmative payload with 400', async () => {
      const req = new Request('https://pulse.example/api/age/verify', {
        method: 'POST',
        headers: {
          Origin: 'https://pulse.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ declaredOver18: false }),
      });

      const res = await handleAgeVerify({ request: req, env: {} });
      expect(res.status).toBe(400);
    });

    it('accepts valid affirmative declaration, sets age_verified cookie, and returns verified: true', async () => {
      const req = new Request('https://pulse.example/api/age/verify', {
        method: 'POST',
        headers: {
          Origin: 'https://pulse.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ declaredOver18: true }),
      });

      const res = await handleAgeVerify({ request: req, env: {} });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ verified: true });

      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain(`${AGE_COOKIE_NAME}=`);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });
  });

  describe('Restricted Media Endpoint: GET /api/media/restricted/:id', () => {
    const validVideoId = '11111111-2222-4333-8444-555555555555';

    it('returns 403 when age_verified cookie is missing', async () => {
      const req = new Request(`https://pulse.example/api/media/restricted/${validVideoId}`);
      const res = await handleRestrictedMedia({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-anon-key',
        },
        params: { id: validVideoId },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Age verification required');
    });

    it('returns 403 when age_verified token is forged or expired', async () => {
      const fakeToken = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
      const req = new Request(`https://pulse.example/api/media/restricted/${validVideoId}`, {
        headers: {
          Cookie: `${AGE_COOKIE_NAME}=${fakeToken}`,
        },
      });

      const res = await handleRestrictedMedia({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-anon-key',
        },
        params: { id: validVideoId },
      });

      expect(res.status).toBe(403);
    });

    it('issues signed media and poster URLs when valid age token is provided', async () => {
      const token = generateAgeToken();
      await saveAgeVerification(token);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = typeof input === 'string' ? input : (input as Request).url;

        // Query video metadata
        if (urlStr.includes('/rest/v1/videos')) {
          return new Response(
            JSON.stringify([
              {
                id: validVideoId,
                title: 'Restricted Documentary',
                description: 'Mature themes',
                video_url: `restricted/${validVideoId}/master.m3u8`,
                thumbnail_url: `restricted/${validVideoId}/poster.webp`,
                duration_seconds: 120,
                visibility: 'age_restricted',
                status: 'ready',
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Sign media URL
        if (urlStr.includes('/storage/v1/object/sign/videos/')) {
          const body = JSON.parse((init?.body as string) || '{}');
          expect(body.expiresIn).toBe(300);
          return new Response(
            JSON.stringify({ signedURL: `/videos/restricted/signed-asset-token` }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response('Not found', { status: 404 });
      });

      const req = new Request(`https://pulse.example/api/media/restricted/${validVideoId}`, {
        headers: {
          Cookie: `${AGE_COOKIE_NAME}=${token}`,
        },
      });

      const res = await handleRestrictedMedia({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
        },
        params: { id: validVideoId },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(validVideoId);
      expect(data.visibility).toBe('age_restricted');
      expect(data.video_url).toContain('/storage/v1/videos/restricted/signed-asset-token');
      expect(data.expires_in).toBe(300);
    });
  });

  describe('Client AgeVerificationService', () => {
    it('status() checks server and returns verified / unverified without storing tokens', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ verified: true }), { status: 200 })
      );

      const status = await ageVerificationService.status();
      expect(status).toBe('verified');
      expect(ageVerificationService.getSnapshot()).toBe('verified');
    });

    it('declareAdult() posts affirmative payload and updates reactive listeners', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
        expect(input).toBe('/api/age/verify');
        expect(init?.body).toBe(JSON.stringify({ declaredOver18: true }));
        return new Response(JSON.stringify({ verified: true }), { status: 200 });
      });

      const listener = vi.fn();
      const unsubscribe = ageVerificationService.subscribe(listener);

      const result = await ageVerificationService.declareAdult();
      expect(result).toBe('verified');
      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });
  });
});
