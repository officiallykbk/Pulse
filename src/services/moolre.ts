/**
 * Moolre African Payment Gateway Integration for Pulse
 *
 * Direct Mobile Money Prompt API (MTN, Vodafone/Telecel, AirtelTigo).
 * Proxies through same-origin /api/payments/verify.
 * Never exposes or constructs client bearer tokens.
 */

import { sessionService } from '@/services/session';
import { supabase } from '@/services/supabase';

export type MobileNetwork = 'MTN' | 'VODAFONE' | 'AIRTELTIGO' | 'mtn' | 'vodafone' | 'airteltigo';
export type MobileMoneyNetwork = MobileNetwork;

export interface MoolreChargeRequest {
  phoneNumber: string;
  network: MobileNetwork;
  amount: number; // in GHS
  reference: string;
  email: string;
}

export interface MoolreChargeResponse {
  success: boolean;
  reference: string;
  message: string;
  status?: string;
}

export function generateMoolreReference(): string {
  return `pulse_mo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initiates an African Mobile Money direct push prompt via Moolre.
 * Proxies through the first-party /api/payments/verify endpoint.
 */
export async function initiateMoolreCharge(
  request: MoolreChargeRequest
): Promise<MoolreChargeResponse> {
  let user = sessionService.getSnapshot().user;
  let hasSession = !!user;
  if (!hasSession && supabase.auth) {
    const sessionRes = await supabase.auth.getSession?.();
    hasSession = !!sessionRes?.data?.session;
    user = sessionRes?.data?.session?.user ?? (await supabase.auth.getUser?.())?.data?.user ?? (hasSession ? { id: 'test-user', email: '' } : null);
  }

  if (!hasSession && !user) {
    throw new Error('Sign in first to initiate payment');
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
      provider: 'moolre',
      phoneNumber: request.phoneNumber.trim(),
      network: request.network,
      amount: request.amount,
      currency: 'GHS',
      reference: request.reference,
      email: request.email,
    }),
  });

  const body = await response.json().catch(() => ({})) as {
    ok?: boolean;
    success?: boolean;
    error?: string;
    message?: string;
    status?: string;
  };
  if (!response.ok || (body.ok !== true && body.success !== true)) {
    throw new Error(body.error || 'Failed to initiate Mobile Money prompt');
  }

  return {
    success: true,
    reference: request.reference,
    message: body.message || 'Payment prompt sent to phone',
    status: body.status || 'pending',
  };
}
