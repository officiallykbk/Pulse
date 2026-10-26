import { useState, useEffect } from 'react';
import { Crown, X, Check, Smartphone, CreditCard, Loader2 } from 'lucide-react';
import { openCheckout, generateReference, verifyPayment as verifyPaystack } from '@/services/paystack';
import { initiateMoolreCharge, generateMoolreReference, type MobileNetwork } from '@/services/moolre';
import { createStripeSession } from '@/services/stripe';
import { verifyPayment } from '@/services/payments';
import type { UserTier } from '@/types';

interface ProUpgradeModalProps {
  open: boolean;
  email: string;
  tier: UserTier;
  onClose: () => void;
  onSuccess: () => void;
}

const PRO_PRICE_PESEWAS = 1000; // GHS 10.00/month
type PaymentTab = 'momo' | 'card';

export function ProUpgradeModal({ open, email, tier, onClose, onSuccess }: ProUpgradeModalProps) {
  const [tab, setTab] = useState<PaymentTab>('momo');
  const [mobileNetwork, setMobileNetwork] = useState<MobileNetwork>('MTN');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [processing, setProcessing] = useState(false);
  const [waitingForPin, setWaitingForPin] = useState(false);
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setProcessing(false);
      setWaitingForPin(false);
      setPendingRef(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  // Poll verification if waiting for USSD MoMo PIN confirmation
  const handleCheckMomoStatus = async () => {
    if (!pendingRef) return;
    setProcessing(true);
    setError(null);

    const result = await verifyPayment(pendingRef, 'moolre');
    setProcessing(false);

    if (result.ok) {
      setWaitingForPin(false);
      onSuccess();
    } else {
      setError(result.error || 'Payment not detected yet. Please check your phone.');
    }
  };

  const handleMoolreSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setError('Please enter your Mobile Money phone number');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const reference = generateMoolreReference();
      await initiateMoolreCharge({
        phoneNumber: phoneNumber.trim(),
        network: mobileNetwork,
        amount: 10.00,
        email: email || 'subscriber@pulse.video',
        reference,
      });

      setPendingRef(reference);
      setWaitingForPin(true);
    } catch (err) {
      // If direct Moolre backend isn't configured with live keys, offer Paystack fallback
      console.warn('Moolre direct prompt error, using fallback:', err);
      handlePaystackFallback();
    } finally {
      setProcessing(false);
    }
  };

  const handlePaystackFallback = async () => {
    setProcessing(true);
    setError(null);
    try {
      const reference = generateReference();
      await openCheckout({
        email: email || 'subscriber@pulse.video',
        amount: PRO_PRICE_PESEWAS,
        currency: 'GHS',
        reference,
        callback: async (response) => {
          if (response.status === 'success') {
            const result = await verifyPaystack(reference);
            setProcessing(false);
            if (result.ok) {
              onSuccess();
            } else {
              setError(result.error);
            }
          } else {
            setProcessing(false);
            setError('Payment was not completed');
          }
        },
        onClose: () => {
          setProcessing(false);
        },
      });
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : 'Payment failed to start');
    }
  };

  const handleStripeSubscribe = async () => {
    setProcessing(true);
    setError(null);
    try {
      const session = await createStripeSession({
        email: email || 'subscriber@pulse.video',
        amount: 1000,
        currency: 'USD',
      });

      if (session.url) {
        window.location.href = session.url;
      } else {
        setProcessing(false);
        setError('Card checkout is currently being initialized');
      }
    } catch (err) {
      setProcessing(false);
      setError(err instanceof Error ? err.message : 'Card checkout unavailable');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-sm rounded-card bg-surface-raised p-6">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/20">
            <Crown className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Go Pro</h2>
            <p className="text-sm text-white/50">GHS 10.00 / month ($0.99)</p>
          </div>
        </div>

        <ul className="mb-5 space-y-2.5">
          {['Zero ads — pure uninterrupted video', 'Priority bandwidth & fast video loading', 'Support favorite creators', 'Cancel anytime'].map((benefit) => (
            <li key={benefit} className="flex items-center gap-3 text-xs text-white/80">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-success/20">
                <Check className="h-3 w-3 text-success" />
              </div>
              {benefit}
            </li>
          ))}
        </ul>

        {/* Payment Method Tabs */}
        {!waitingForPin && (
          <div className="mb-4 flex rounded-xl bg-surface-elevated p-1">
            <button
              type="button"
              onClick={() => setTab('momo')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === 'momo' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              Mobile Money
            </button>
            <button
              type="button"
              onClick={() => setTab('card')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
                tab === 'card' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
              }`}
            >
              <CreditCard className="h-3.5 w-3.5" />
              Card (Global)
            </button>
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg bg-error/15 px-3 py-2 text-xs text-error">{error}</p>
        )}

        {waitingForPin ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent animate-pulse">
              <Smartphone className="h-7 w-7" />
            </div>
            <div>
              <p className="font-semibold text-white">Check Your Phone!</p>
              <p className="mt-1 text-xs leading-relaxed text-white/60">
                A USSD prompt has been sent to <span className="font-medium text-white">{phoneNumber}</span>.
                Please enter your Mobile Money PIN to authorize GHS 10.00.
              </p>
            </div>
            <button
              onClick={handleCheckMomoStatus}
              disabled={processing}
              className="w-full rounded-full bg-accent py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {processing ? 'Verifying payment...' : "I've Entered My PIN"}
            </button>
            <button
              type="button"
              onClick={() => setWaitingForPin(false)}
              className="text-xs text-white/40 hover:text-white"
            >
              Use different payment method
            </button>
          </div>
        ) : tab === 'momo' ? (
          <form onSubmit={handleMoolreSubscribe} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">Select Network</label>
              <div className="grid grid-cols-3 gap-2">
                {(['MTN', 'VODAFONE', 'AIRTELTIGO'] as MobileNetwork[]).map((net) => (
                  <button
                    key={net}
                    type="button"
                    onClick={() => setMobileNetwork(net)}
                    className={`rounded-lg py-2 text-xs font-bold transition-colors ${
                      mobileNetwork === net
                        ? 'bg-white/20 text-white ring-1 ring-accent'
                        : 'bg-surface-elevated text-white/50 hover:text-white'
                    }`}
                  >
                    {net === 'VODAFONE' ? 'Telecel' : net === 'AIRTELTIGO' ? 'AT' : 'MTN'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-white/70">Mobile Money Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="024 XXX XXXX"
                required
                className="w-full rounded-lg bg-surface-elevated px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
              />
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full rounded-full bg-accent py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {processing ? 'Connecting...' : 'Pay GHS 10.00 with MoMo'}
            </button>

            <button
              type="button"
              onClick={handlePaystackFallback}
              disabled={processing}
              className="w-full text-center text-xs text-white/40 hover:text-white/80"
            >
              Or pay via Paystack checkout popup
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-white/60">
              Pay securely using Visa, Mastercard, American Express, or Apple Pay through our global Stripe gateway.
            </p>
            <button
              onClick={handleStripeSubscribe}
              disabled={processing}
              className="w-full rounded-full bg-accent py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {processing ? 'Opening Stripe...' : 'Pay with Card ($0.99 / mo)'}
            </button>
          </div>
        )}

        {tier === 'anonymous' && (
          <p className="mt-3 text-center text-xs text-white/40">
            You'll need to register first — sign in is free
          </p>
        )}
      </div>
    </div>
  );
}
