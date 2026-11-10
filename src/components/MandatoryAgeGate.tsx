import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { isAgeConfirmedLocally, setAgeConfirmedLocally } from '@/lib/ageConfirmation';

export interface MandatoryAgeGateProps {
  onConfirmed?: () => void;
  forceShowForTesting?: boolean;
}

export function MandatoryAgeGate({ onConfirmed, forceShowForTesting }: MandatoryAgeGateProps) {
  const [confirmed, setConfirmed] = useState<boolean>(() => {
    if (forceShowForTesting) return false;
    return isAgeConfirmedLocally();
  });

  const [viewState, setViewState] = useState<'prompt' | 'under_18'>('prompt');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!forceShowForTesting && isAgeConfirmedLocally()) {
      setConfirmed(true);
    }
  }, [forceShowForTesting]);

  if (confirmed && !forceShowForTesting) {
    return null;
  }

  const handleConfirmAge = () => {
    setIsSubmitting(true);
    setAgeConfirmedLocally();
    setConfirmed(true);
    setIsSubmitting(false);
    onConfirmed?.();
  };

  const handleDeclineAge = () => {
    setViewState('under_18');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-heading"
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md select-none"
    >
      <div className="relative w-full max-w-[340px] rounded-2xl bg-[#141414] border border-white/10 p-5 shadow-2xl text-white text-center">
        {viewState === 'prompt' ? (
          <>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <h1 id="age-gate-heading" className="text-lg font-bold text-white">
              Are you 18 or older?
            </h1>

            <p className="mt-1.5 text-xs text-white/60 leading-normal">
              This platform includes mature content. Confirm your age to continue. Stored locally without tracking.
            </p>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={handleConfirmAge}
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded-xl font-semibold bg-accent hover:bg-accent-hover text-white text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                I am 18 or older — Enter Pulse
              </button>

              <button
                type="button"
                onClick={handleDeclineAge}
                className="w-full py-2 px-3 text-xs text-white/50 hover:text-white transition-colors"
              >
                I am under 18 — Exit
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Access Restricted
            </span>
            <h1 id="age-gate-heading" className="text-lg font-bold text-white mt-0.5">
              18+ Required
            </h1>

            <p className="mt-1.5 text-xs text-white/60 leading-normal">
              You must be 18 years of age or older to view content on Pulse.
            </p>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => setViewState('prompt')}
                className="w-full py-2.5 px-4 rounded-xl font-medium bg-white/10 hover:bg-white/15 text-white text-xs transition-colors"
              >
                I made a mistake — Verify Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
