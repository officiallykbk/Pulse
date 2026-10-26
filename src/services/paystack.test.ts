import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateReference } from '@/services/paystack';

// verifyPayment imports the real Supabase client, which reads env at module load.
// Mock the module and re-implement fetch-level behavior to test decision logic.
vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

import { verifyPayment } from '@/services/paystack';
import { supabase } from '@/services/supabase';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function setSession(signedIn: boolean) {
  (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue(
    signedIn
      ? { data: { session: { access_token: 'token-123' } } }
      : { data: { session: null } }
  );
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number, body: unknown) {
  return { ok: false, status, json: async () => body };
}

describe('verifyPayment (client-side payment verification)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockReset();
  });

  it('returns success when the server confirms the payment', async () => {
    setSession(true);
    mockFetch.mockResolvedValue(okResponse({ success: true }));

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });

  it('sends the reference with an Authorization header', async () => {
    setSession(true);
    mockFetch.mockResolvedValue(okResponse({ success: true }));

    await verifyPayment('ref-abc');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/functions/v1/verifypayment');
    expect(init.headers.Authorization).toBe('Bearer token-123');
    expect(JSON.parse(init.body)).toEqual({ reference: 'ref-abc' });
  });

  it('refuses to verify when not signed in', async () => {
    setSession(false);
    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Sign in');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('surfaces the server error message on rejection (402 invalid payment)', async () => {
    setSession(true);
    mockFetch.mockResolvedValue(
      errorResponse(402, { error: 'Payment not completed or invalid' })
    );

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Payment not completed or invalid');
  });

  it('falls back to a generic message when the error body is unreadable', async () => {
    setSession(true);
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    });

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('rejects a 200 response that does not confirm success', async () => {
    setSession(true);
    mockFetch.mockResolvedValue(okResponse({ success: false }));

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('unexpected response');
  });

  it('rejects a malformed 200 body', async () => {
    setSession(true);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    });

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
  });

  it('reports a network failure distinctly', async () => {
    setSession(true);
    mockFetch.mockRejectedValue(new TypeError('network down'));

    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Could not reach');
  });

  it('never writes a subscription directly from the browser (security regression guard)', async () => {
    // The mock supabase has no .from(); if the client ever tries to insert into
    // subscriptions directly, this test fails — the fix must stay server-side.
    expect((supabase as unknown as { from?: unknown }).from).toBeUndefined();
    setSession(true);
    mockFetch.mockResolvedValue(okResponse({ success: true }));
    const result = await verifyPayment('ref-1');
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('generateReference', () => {
  it('produces references with the gvp_ prefix', () => {
    expect(generateReference()).toMatch(/^gvp_/);
  });

  it('produces unique references', () => {
    const refs = new Set(Array.from({ length: 100 }, () => generateReference()));
    expect(refs.size).toBe(100);
  });
});
