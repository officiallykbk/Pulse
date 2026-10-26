import { describe, it, expect, vi, beforeEach } from 'vitest';

// Tests for the verifypayment edge function's decision logic. The function body
// is evaluated by importing it with Deno globals stubbed (Deno.serve captures the
// handler; env vars are stubbed). This validates: auth required, Paystack
// verification enforced, amount/currency checked, idempotency per reference.

type Handler = (req: Request) => Promise<Response>;

const { serveHandler, envVars, mockFrom, mockGetUser } = vi.hoisted(() => ({
  serveHandler: { fn: null as null | ((req: Request) => Promise<Response>) },
  envVars: {} as Record<string, string>,
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}));

// Stub Deno globals before importing the function under test
vi.stubGlobal('Deno', {
  serve: (handler: Handler) => {
    serveHandler.fn = handler;
  },
  env: {
    get: (name: string) => envVars[name],
  },
});

// Mock the npm: module the edge function imports (mapped to the local package by
// the vitest alias). The function calls createClient per-request.
vi.mock('npm:@supabase/supabase-js@2.57.4', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

await import('./verifypayment-fixtures');

const handler = serveHandler.fn as Handler;

const SERVICE_URL = 'https://project.supabase.co';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function postRequest(body: unknown, withAuth = true): Request {
  return new Request(`${SERVICE_URL}/functions/v1/verifypayment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(withAuth ? { Authorization: 'Bearer user-jwt' } : {}),
    },
    body: JSON.stringify(body),
  });
}

function mockPaystack(status: string, amount: number, currency = 'GHS', apiStatus = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          status: apiStatus,
          data: { status, amount, currency, reference: 'ref-1' },
        }),
        { status: 200 }
      )
    )
  );
}

function mockSubscriptionsTable({
  existingId,
  insertError,
}: { existingId?: string; insertError?: string } = {}) {
  mockFrom.mockImplementation((table: string) => {
    if (table !== 'subscriptions') {
      throw new Error(`unexpected table: ${table}`);
    }
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({
        data: existingId ? { id: existingId } : null,
        error: null,
      }),
      insert: async () => ({
        data: null,
        error: insertError ? { message: insertError } : null,
      }),
    };
    return builder;
  });
}

describe('verifypayment edge function (server-side payment verification)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockGetUser.mockReset();
    envVars.SUPABASE_URL = SERVICE_URL;
    envVars.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    envVars.PAYSTACK_SECRET_KEY = 'sk_test_xxx';
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('answers CORS preflight', async () => {
    const res = await handler(
      new Request(SERVICE_URL, { method: 'OPTIONS' })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects non-POST requests', async () => {
    const res = await handler(new Request(SERVICE_URL, { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('refuses requests without an Authorization header', async () => {
    const res = await handler(postRequest({ reference: 'ref-1' }, false));
    expect(res.status).toBe(401);
  });

  it('rejects a missing reference', async () => {
    const res = await handler(postRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 503 when Paystack is not configured', async () => {
    delete envVars.PAYSTACK_SECRET_KEY;
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(503);
  });

  it('returns 401 when the caller is not signed in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(401);
  });

  it('grants Pro on a valid successful GHS payment of the full amount', async () => {
    mockPaystack('success', 1000);
    mockSubscriptionsTable();
    const res = await handler(postRequest({ reference: 'ref-1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('rejects a payment below the GHS 10.00 price', async () => {
    mockPaystack('success', 500);
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(402);
  });

  it('rejects a payment in the wrong currency', async () => {
    mockPaystack('success', 1000, 'USD');
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(402);
  });

  it('rejects a transaction whose Paystack status is not success', async () => {
    mockPaystack('failed', 1000);
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(402);
  });

  it('rejects when the Paystack API itself reports failure', async () => {
    mockPaystack('success', 1000, 'GHS', false);
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(402);
  });

  it('is idempotent: does not insert twice for the same reference', async () => {
    mockPaystack('success', 1000);
    mockSubscriptionsTable({ existingId: 'sub-1' });
    const res = await handler(postRequest({ reference: 'ref-1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyVerified).toBe(true);
  });

  it('returns 500 if the subscription insert fails', async () => {
    mockPaystack('success', 1000);
    mockSubscriptionsTable({ insertError: 'db error' });
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(500);
  });

  it('writes a subscription with tier pro and a 30-day expiry', async () => {
    mockPaystack('success', 1000);
    let captured: Record<string, unknown> | undefined;
    mockFrom.mockImplementation(() => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async (payload: Record<string, unknown>) => {
          captured = payload;
          return { data: null, error: null };
        },
      };
      return builder;
    });
    await handler(postRequest({ reference: 'ref-1' }));
    expect(captured).toBeDefined();
    expect(captured!.tier).toBe('pro');
    expect(captured!.status).toBe('active');
    expect(captured!.paystack_reference).toBe('ref-1');
    const expires = new Date(captured!.expires_at as string).getTime();
    const expected = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(expires - expected)).toBeLessThan(60_000);
  });

  it('rejects when Paystack API returns an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('error', { status: 500 }))
    );
    const res = await handler(postRequest({ reference: 'ref-1' }));
    expect(res.status).toBe(502);
  });
});
