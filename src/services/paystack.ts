// Paystack inline checkout integration

import { supabase } from '@/services/supabase';

export interface PaystackOptions {
  email: string;
  amount: number; // in GHS pesewas (e.g. 1000 = GHS 10.00)
  currency: string;
  reference: string;
  callback: (response: PaystackResponse) => void;
  onClose: () => void;
}

export interface PaystackResponse {
  reference: string;
  status: string;
  message: string;
  transaction: string;
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackOptions) => { openIframe: () => void };
    };
  }
}

export function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Paystack SDK'));
    document.head.appendChild(script);
  });
}

export async function openCheckout(options: PaystackOptions): Promise<void> {
  await loadPaystackScript();
  if (!window.PaystackPop) {
    throw new Error('Paystack SDK not available');
  }
  const handler = window.PaystackPop.setup(options);
  handler.openIframe();
}

export function generateReference(): string {
  return `gvp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface VerifyPaymentResult {
  ok: boolean;
  error: string | null;
}

// Server-side verification: the edge function confirms the payment with Paystack
// and writes the subscription. The browser never grants Pro itself.
export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: 'Sign in first to complete your subscription' };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verifypayment`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reference }),
      }
    );

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

    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Could not reach the payment verification service' };
  }
}
