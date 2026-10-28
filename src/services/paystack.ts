/**
 * Paystack Integration Service for Pulse
 *
 * Direct Popup flow with server-side transaction verification via /api/payments/verify.
 * Uses first-party session cookies and double-submit CSRF.
 * Never constructs or sends client bearer tokens.
 */

import { sessionService } from '@/services/session';
import { supabase } from '@/services/supabase';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: PaystackOptions) => {
        openIframe: () => void;
      };
    };
  }
}

export interface PaystackResponse {
  reference: string;
  status: string;
  message?: string;
  transaction?: string;
}

export interface PaystackOptions {
  key?: string;
  email: string;
  amount: number; // in GHS pesewas (1 GHS = 100 pesewas)
  currency?: string;
  ref?: string;
  reference?: string;
  callback: (response: PaystackResponse) => void;
  onClose: () => void;
}

export function loadPaystackScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
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
  if (typeof window === 'undefined' || !window.PaystackPop) {
    throw new Error('Paystack SDK not available');
  }
  const key = options.key || import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
  const handler = window.PaystackPop.setup({
    ...options,
    key,
  });
  handler.openIframe();
}

export function generateReference(): string {
  return `gvp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function openPaystackPopup(options: {
  email: string;
  amountInGHS: number;
  onSuccess: (reference: string) => void;
  onClose: () => void;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
  if (!publicKey || publicKey.includes('placeholder') || !publicKey.startsWith('pk_')) {
    throw new Error('Paystack public key is not configured. Please contact support.');
  }

  if (typeof window === 'undefined' || !window.PaystackPop) {
    throw new Error('Payment service is still loading. Please try again in a moment.');
  }

  const reference = generateReference();
  const amountInPesewas = Math.round(options.amountInGHS * 100);

  const handler = window.PaystackPop.setup({
    key: publicKey,
    email: options.email,
    amount: amountInPesewas,
    currency: 'GHS',
    ref: reference,
    callback: (response) => {
      options.onSuccess(response.reference);
    },
    onClose: () => {
      options.onClose();
    },
  });

  handler.openIframe();
}

export interface VerifyPaymentResult {
  ok: boolean;
  error: string | null;
}

// Server-side verification: same-origin proxy confirms the payment with Paystack
// and writes the subscription. The browser never grants Pro itself.
export async function verifyPayment(reference: string): Promise<VerifyPaymentResult> {
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
      body: JSON.stringify({ reference, provider: 'paystack' }),
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

    return { ok: true, error: null };
  } catch {
    return { ok: false, error: 'Could not reach the payment verification service' };
  }
}
