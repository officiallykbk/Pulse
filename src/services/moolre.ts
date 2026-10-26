// Moolre African Mobile Money Service (MTN, Telecel/Vodafone, AirtelTigo)

import { supabase } from '@/services/supabase';

export type MobileNetwork = 'MTN' | 'VODAFONE' | 'AIRTELTIGO';

export interface MoolreChargeRequest {
  phoneNumber: string;
  network: MobileNetwork;
  amount: number; // In GHS (e.g. 10.00)
  email: string;
  reference: string;
}

export interface MoolreChargeResponse {
  success: boolean;
  reference: string;
  status: 'pending' | 'success' | 'failed';
  message: string;
}

export function generateMoolreReference(): string {
  return `pulse_mo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Initiates an African Mobile Money direct push prompt via Moolre.
 * This triggers a USSD popup on the subscriber's phone requesting their MoMo PIN.
 */
export async function initiateMoolreCharge(
  request: MoolreChargeRequest
): Promise<MoolreChargeResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Sign in first to initiate payment');
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
      provider: 'moolre',
      phoneNumber: request.phoneNumber.trim(),
      network: request.network,
      amount: request.amount,
      currency: 'GHS',
      reference: request.reference,
      email: request.email,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    throw new Error(body.error || 'Failed to initiate Mobile Money prompt');
  }

  return {
    success: true,
    reference: request.reference,
    status: body.status || 'pending',
    message: body.message || 'Please check your phone and enter your Mobile Money PIN',
  };
}
