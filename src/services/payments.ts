/**
 * Pulse Platform: Unified Provider-Agnostic Payment Engine
 *
 * Coordinates African Mobile Money (Moolre) and International Cards (Stripe),
 * while maintaining backward compatibility with Paystack.
 */

import { supabase } from '@/services/supabase';

export type PaymentProvider = 'moolre' | 'stripe' | 'paystack';

export interface VerifyPaymentResult {
  ok: boolean;
  error: string | null;
  alreadyVerified?: boolean;
  expiresAt?: string;
}

export function generatePaymentReference(provider: PaymentProvider = 'moolre'): string {
  const prefix = provider === 'moolre' ? 'pulse_mo' : provider === 'stripe' ? 'pulse_st' : 'gvp';
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Server-side verification: the Edge Function confirms the transaction with the
 * specified provider (Moolre, Stripe, or Paystack) and writes the subscription row.
 * The browser never grants Pro directly.
 */
export async function verifyPayment(
  reference: string,
  provider: PaymentProvider = 'paystack'
): Promise<VerifyPaymentResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: 'Sign in first to complete your subscription' };
    }

    const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifypayment`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference, provider }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        body && typeof body.error === 'string'
          ? body.error
          : `Payment verification failed (${response.status})`;
      return { ok: false, error: message };
    }

    const body = await response.json().catch(() => null);
    if (!body || body.success !== true) {
      return { ok: false, error: 'Verification returned an unexpected response' };
    }

    return {
      ok: true,
      error: null,
      alreadyVerified: body.alreadyVerified,
      expiresAt: body.expiresAt,
    };
  } catch {
    return { ok: false, error: 'Could not reach the payment verification service' };
  }
}
