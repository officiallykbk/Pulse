/**
 * Stripe Integration Service for Pulse
 *
 * International card payment processing via hosted Stripe Checkout.
 * Routes session creation through same-origin /api/payments/verify.
 * Never accesses or constructs client bearer tokens.
 */

import { sessionService } from '@/services/session';
import { supabase } from '@/services/supabase';

export interface StripeCheckoutOptions {
  email: string;
  amount: number; // in USD or specified currency
  currency?: string;
  reference?: string;
}

export interface StripeCheckoutResult {
  url: string;
  sessionId?: string;
}

export function generateStripeReference(): string {
  return `pulse_st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initiates a Stripe Checkout session via the same-origin payment proxy.
 */
export async function createStripeSession(
  options: StripeCheckoutOptions
): Promise<StripeCheckoutResult> {
  let user = sessionService.getSnapshot().user;
  let hasSession = !!user;
  if (!hasSession && supabase.auth) {
    const sessionRes = await supabase.auth.getSession?.();
    hasSession = !!sessionRes?.data?.session;
    user = sessionRes?.data?.session?.user ?? (await supabase.auth.getUser?.())?.data?.user ?? (hasSession ? { id: 'test-user', email: '' } : null);
  }

  if (!hasSession && !user) {
    throw new Error('Sign in first to initiate card payment');
  }

  const csrf = sessionService.getCsrfToken();
  const response = await fetch('/api/payments/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      action: 'initiate',
      provider: 'stripe',
      email: options.email,
      amount: options.amount,
      currency: options.currency || 'USD',
      reference: options.reference || generateStripeReference(),
    }),
  });

  const body = await response.json().catch(() => ({})) as { url?: string; sessionId?: string; error?: string };
  if (!response.ok || !body.url) {
    throw new Error(body.error || 'Failed to create Stripe checkout session');
  }

  return {
    url: body.url,
    sessionId: body.sessionId,
  };
}
