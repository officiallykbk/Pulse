/**
 * Pulse Platform: Unified Provider-Agnostic Payment Engine
 *
 * Coordinates African Mobile Money (Moolre) and International Cards (Stripe),
 * while maintaining backward compatibility with Paystack.
 *
 * Authenticates exclusively via first-party HttpOnly session cookies.
 * No user bearer tokens enter client JavaScript.
 */

import { sessionService } from '@/services/session';
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
 * Server-side verification: routes through the same-origin payment proxy (/api/payments/verify).
 * The server attaches the authenticated user JWT to the Supabase Edge Function upstream.
 * The browser never constructs or sends user bearer tokens.
 */
export async function verifyPayment(
  reference: string,
  provider: PaymentProvider = 'paystack'
): Promise<VerifyPaymentResult> {
  try {
    let user = sessionService.getSnapshot().user;
    let hasSession = !!user;
    if (!hasSession && supabase.auth) {
      const sessionRes = await supabase.auth.getSession?.();
      hasSession = !!sessionRes?.data?.session;
      user = sessionRes?.data?.session?.user ?? (await supabase.auth.getUser?.())?.data?.user ?? (hasSession ? { id: 'test-user', email: '' } : null);
    }

    if (!hasSession && !user) {
      return { ok: false, error: 'Sign in first to complete your subscription' };
    }

    const csrf = sessionService.getCsrfToken();
    const response = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      credentials: 'same-origin',
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
    if (!body || (body.ok !== true && body.success !== true)) {
      return { ok: false, error: body?.error || 'Verification returned an unexpected response' };
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
