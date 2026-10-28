import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initiateMoolreCharge, generateMoolreReference } from '@/services/moolre';
import { createStripeSession, generateStripeReference } from '@/services/stripe';

const state = vi.hoisted(() => ({
  session: { access_token: 'fake-jwt' } as { access_token: string } | null,
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

describe('Moolre & Stripe Payment Services', () => {
  beforeEach(() => {
    state.session = { access_token: 'fake-jwt' };
    vi.restoreAllMocks();
  });

  describe('Moolre Mobile Money Service', () => {
    it('generates pulse_mo_ prefixed references', () => {
      const ref = generateMoolreReference();
      expect(ref.startsWith('pulse_mo_')).toBe(true);
    });

    it('requires authentication before initiating charge', async () => {
      state.session = null;
      await expect(
        initiateMoolreCharge({
          phoneNumber: '0241234567',
          network: 'MTN',
          amount: 10,
          email: 'test@pulse.video',
          reference: 'pulse_mo_1',
        })
      ).rejects.toThrow('Sign in first to initiate payment');
    });

    it('initiates mobile money charge and returns pending prompt status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            status: 'pending',
            message: 'Please check your phone and enter your Mobile Money PIN',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await initiateMoolreCharge({
        phoneNumber: '0241234567',
        network: 'MTN',
        amount: 10,
        email: 'test@pulse.video',
        reference: 'pulse_mo_123',
      });

      expect(res.success).toBe(true);
      expect(res.reference).toBe('pulse_mo_123');
      expect(res.status).toBe('pending');
    });
  });

  describe('Stripe Global Payment Service', () => {
    it('generates pulse_st_ prefixed references', () => {
      const ref = generateStripeReference();
      expect(ref.startsWith('pulse_st_')).toBe(true);
    });

    it('requires authentication before creating checkout session', async () => {
      state.session = null;
      await expect(
        createStripeSession({
          email: 'test@pulse.video',
          amount: 1000,
        })
      ).rejects.toThrow('Sign in first to initiate card payment');
    });

    it('creates checkout session and returns redirect URL', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            url: 'https://checkout.stripe.com/c/pay/cs_test_123',
            sessionId: 'cs_test_123',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await createStripeSession({
        email: 'test@pulse.video',
        amount: 1000,
      });

      expect(res.url).toBe('https://checkout.stripe.com/c/pay/cs_test_123');
      expect(res.sessionId).toBe('cs_test_123');
    });
  });
});
