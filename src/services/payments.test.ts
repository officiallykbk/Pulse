import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePaymentReference, verifyPayment } from '@/services/payments';

const state = vi.hoisted(() => ({
  session: { access_token: 'fake-token' } as { access_token: string } | null,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: state.session },
      })),
    },
  },
}));

describe('Unified Provider-Agnostic Payment Engine', () => {
  beforeEach(() => {
    state.session = { access_token: 'fake-token' };
    vi.restoreAllMocks();
  });

  describe('generatePaymentReference', () => {
    it('generates pulse_mo_ prefixed references for Moolre Mobile Money', () => {
      const ref = generatePaymentReference('moolre');
      expect(ref.startsWith('pulse_mo_')).toBe(true);
    });

    it('generates pulse_st_ prefixed references for Stripe cards', () => {
      const ref = generatePaymentReference('stripe');
      expect(ref.startsWith('pulse_st_')).toBe(true);
    });

    it('generates gvp_ prefixed references for Paystack fallback', () => {
      const ref = generatePaymentReference('paystack');
      expect(ref.startsWith('gvp_')).toBe(true);
    });
  });

  describe('verifyPayment', () => {
    it('refuses to verify when not signed in', async () => {
      state.session = null;
      const res = await verifyPayment('ref_123', 'moolre');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Sign in first to complete your subscription');
    });

    it('sends the reference and provider to the Edge Function', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, expiresAt: '2026-11-26T00:00:00Z' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const res = await verifyPayment('pulse_mo_123', 'moolre');
      expect(res.ok).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/verifypayment'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reference: 'pulse_mo_123', provider: 'moolre' }),
        })
      );
    });

    it('surfaces error message when payment verification fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Payment not completed or invalid' }), {
          status: 402,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const res = await verifyPayment('pulse_mo_failed', 'moolre');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Payment not completed or invalid');
    });

    it('gracefully handles network unreachable errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
      const res = await verifyPayment('pulse_st_error', 'stripe');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Could not reach the payment verification service');
    });
  });
});
