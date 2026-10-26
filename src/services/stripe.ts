// Stripe Global Payment Service (Cards & International payments)

import { supabase } from '@/services/supabase';

export interface StripeCheckoutOptions {
  email: string;
  amount: number; // e.g. 1000 for GHS 10.00 or $0.99
  currency?: string;
  reference?: string;
}

export interface StripeCheckoutResult {
  url?: string;
  sessionId?: string;
}

export function generateStripeReference(): string {
  return `pulse_st_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initiates a Stripe Checkout session via the Edge Function
 */
export async function createStripeSession(
  options: StripeCheckoutOptions
): Promise<StripeCheckoutResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Sign in first to initiate card payment');
  }

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifypayment`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'initiate',
      provider: 'stripe',
      email: options.email,
      amount: options.amount,
      currency: options.currency || 'USD',
      reference: options.reference || generateStripeReference(),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.url) {
    throw new Error(body.error || 'Failed to create Stripe checkout session');
  }

  return {
    url: body.url,
    sessionId: body.sessionId,
  };
}
