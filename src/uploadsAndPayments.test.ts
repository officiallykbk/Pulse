import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as signUploadHandler } from '../functions/api/uploads/sign';
import { onRequestPost as paymentVerifyHandler } from '../functions/api/payments/verify';

const testEnv = {
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'secret-service-role-key',
};

describe('Phase 2: Upload Signing Endpoint (/api/uploads/sign)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated requests with 401', async () => {
    const req = new Request('https://pulse.video/api/uploads/sign', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'video.mp4', fileSize: 1024, mimeType: 'video/mp4' }),
    });

    const res = await signUploadHandler({ request: req, env: testEnv });
    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid or missing CSRF token with 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'good-user', email: 'good@test.com' }), { status: 200 });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const req = new Request('https://pulse.video/api/uploads/sign', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        cookie: '__Host-pulse_access=valid-token; __Host-pulse_csrf=expected-csrf',
        'x-csrf-token': 'wrong-csrf',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'video.mp4', fileSize: 1024, mimeType: 'video/mp4' }),
    });

    const res = await signUploadHandler({ request: req, env: testEnv });
    expect(res.status).toBe(403);
  });

  it('blocks suspended/banned users from receiving upload URLs', async () => {
    const csrf = 'valid-csrf-token-123';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'banned-user', email: 'banned@test.com' }), { status: 200 });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ is_banned: true, ban_reason: 'Terms violation' }]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const req = new Request('https://pulse.video/api/uploads/sign', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        cookie: `__Host-pulse_access=valid-token; __Host-pulse_csrf=${csrf}`,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'video.mp4', fileSize: 1024, mimeType: 'video/mp4' }),
    });

    const res = await signUploadHandler({ request: req, env: testEnv });
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Terms violation');
  });

  it('rejects oversized video files (>100MB) with 400', async () => {
    const csrf = 'valid-csrf-token-123';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'good-user', email: 'good@test.com' }), { status: 200 });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ is_banned: false }]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const req = new Request('https://pulse.video/api/uploads/sign', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        cookie: `__Host-pulse_access=valid-token; __Host-pulse_csrf=${csrf}`,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'huge.mp4',
        fileSize: 105 * 1024 * 1024, // 105MB
        mimeType: 'video/mp4',
        prefix: 'raw',
      }),
    });

    const res = await signUploadHandler({ request: req, env: testEnv });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('100MB');
  });

  it('issues an object-scoped signed upload URL strictly scoped to raw/ prefix', async () => {
    const csrf = 'valid-csrf-token-123';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'good-user', email: 'good@test.com' }), { status: 200 });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/rest/v1/profiles')) {
        return new Response(JSON.stringify([{ is_banned: false }]), { status: 200 });
      }
      if (url.includes('/storage/v1/object/upload/sign/videos/raw/')) {
        // Assert server attaches service role key upstream
        const headers = init?.headers;
        const key = headers instanceof Headers ? headers.get('apikey') : (headers as Record<string, string>)?.apikey;
        expect(key).toBe(testEnv.SUPABASE_SERVICE_ROLE_KEY);

        return new Response(
          JSON.stringify({ url: '/object/upload/sign/videos/raw/test-signed?token=signed-token-xyz' }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const req = new Request('https://pulse.video/api/uploads/sign', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        cookie: `__Host-pulse_access=valid-token; __Host-pulse_csrf=${csrf}`,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'dance.mp4',
        fileSize: 5 * 1024 * 1024,
        mimeType: 'video/mp4',
        prefix: 'raw',
      }),
    });

    const res = await signUploadHandler({ request: req, env: testEnv });
    expect(res.status).toBe(200);

    const body = await res.json() as { uploadUrl: string; path: string; publicUrl: string };
    expect(body.path.startsWith('raw/')).toBe(true);
    expect(body.uploadUrl).toContain('token=signed-token-xyz');
    expect(body.publicUrl).toContain(body.path);

    // CRITICAL: Ensure service-role key is never leaked
    expect(JSON.stringify(body)).not.toContain(testEnv.SUPABASE_SERVICE_ROLE_KEY);
  });
});

describe('Phase 2: Payment Gateway Proxy (/api/payments/verify)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unauthenticated payment requests with 401', async () => {
    const req = new Request('https://pulse.video/api/payments/verify', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference: 'ref-1', provider: 'paystack' }),
    });

    const res = await paymentVerifyHandler({ request: req, env: testEnv });
    expect(res.status).toBe(401);
  });

  it('forwards payment request to Edge function with server-held user JWT and returns sanitized status', async () => {
    const csrf = 'valid-payment-csrf';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'paying-user-1', email: 'payer@test.com' }), { status: 200 });
      }
      if (url.includes('/rest/v1/subscriptions')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes('/functions/v1/verifypayment')) {
        const headers = init?.headers;
        const auth = headers instanceof Headers ? headers.get('Authorization') : (headers as Record<string, string>)?.Authorization;
        expect(auth).toBe('Bearer user-access-jwt-999');

        return new Response(
          JSON.stringify({
            success: true,
            expiresAt: '2026-11-28T00:00:00Z',
            alreadyVerified: false,
          }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const req = new Request('https://pulse.video/api/payments/verify', {
      method: 'POST',
      headers: {
        origin: 'https://pulse.video',
        cookie: `__Host-pulse_access=user-access-jwt-999; __Host-pulse_csrf=${csrf}`,
        'x-csrf-token': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference: 'pulse_mo_pay_1', provider: 'moolre' }),
    });

    const res = await paymentVerifyHandler({ request: req, env: testEnv });
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.success).toBe(true);
    expect(body.expiresAt).toBe('2026-11-28T00:00:00Z');

    // CRITICAL: Ensure user JWT is never reflected back to client
    expect(body).not.toHaveProperty('access_token');
    expect(JSON.stringify(body)).not.toContain('user-access-jwt-999');
  });
});
