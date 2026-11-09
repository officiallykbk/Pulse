import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Lock, ArrowRight, RefreshCw } from 'lucide-react';
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
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md select-none overflow-y-auto"
    >
      <div className="relative w-full max-w-sm rounded-3xl bg-[#121212] border border-white/10 p-6 sm:p-7 shadow-2xl text-white my-auto">
        {viewState === 'prompt' ? (
          <>
            {/* Header / Brand Icon */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-full ring-1 ring-accent/20">
                  Viewer Protection
                </span>
                <h1 id="age-gate-heading" className="text-xl font-bold text-white mt-1">
                  Are you 18 or older?
                </h1>
              </div>
            </div>

            {/* Explanation Copy */}
            <p className="text-xs text-white/70 leading-relaxed mb-4">
              Pulse showcases vibrant Ghanaian culture, comedy, creative reels, and music. Some
              creator content is intended exclusively for mature audiences aged 18 and older.
            </p>

            {/* Privacy Trust Box */}
            <div className="mb-6 rounded-2xl bg-[#181818] border border-white/10 p-3.5 text-[11px] text-white/60 space-y-1.5">
              <div className="flex items-center gap-2 text-white font-medium">
                <Lock className="h-3.5 w-3.5 text-accent" />
                <span>Privacy-First Guarantee</span>
              </div>
              <p>
                We do not collect identity cards, birth dates, or credit cards. Your confirmation is
                remembered safely on this device so you will not be asked again on refresh.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleConfirmAge}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-semibold bg-accent hover:bg-accent-hover text-white text-sm transition-all shadow-lg shadow-accent/20 active:scale-[0.98] disabled:opacity-50"
              >
                <span>I am 18 or older — Enter Pulse</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={handleDeclineAge}
                className="w-full py-3 px-4 rounded-xl font-medium bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs transition-colors"
              >
                I am under 18 — Exit
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Under 18 Barrier */}
            <div className="flex items-center gap-3.5 mb-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full ring-1 ring-amber-500/20">
                  Access Restricted
                </span>
                <h1 id="age-gate-heading" className="text-xl font-bold text-white mt-1">
                  18+ Required
                </h1>
              </div>
            </div>

            <p className="text-xs text-white/70 leading-relaxed mb-6">
              You must be 18 years of age or older to view content on Pulse. Please close this tab
              or return when you are eligible.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setViewState('prompt')}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-medium bg-white/10 hover:bg-white/15 text-white text-xs transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>I made a mistake — Verify Again</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
