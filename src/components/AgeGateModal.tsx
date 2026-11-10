import { useState } from 'react';
import { ShieldCheck, X, AlertCircle, Loader2 } from 'lucide-react';
import { ageVerificationService } from '@/services/ageVerification';

export interface AgeGateModalProps {
  open: boolean;
  onClose: () => void;
  onVerified?: () => void;
  contentTitle?: string;
}

export function AgeGateModal({
  open,
  onClose,
  onVerified,
  contentTitle,
}: AgeGateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);

    try {
      await ageVerificationService.declareAdult();
      onVerified?.();
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Failed to verify age. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-[340px] bg-[#141414] border border-white/10 rounded-2xl p-5 shadow-2xl text-white text-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 text-white/40 hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Shield Icon */}
        <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
          <ShieldCheck className="w-5 h-5" />
        </div>

        <h2 id="age-gate-title" className="text-base font-bold text-white">
          18+ Content Confirmation
        </h2>

        {contentTitle && (
          <p className="mt-1 text-xs text-white/80 font-medium truncate">
            &ldquo;{contentTitle}&rdquo;
          </p>
        )}

        <p className="mt-2 text-xs text-white/60 leading-relaxed">
          This content is 18+. Pulse does not collect your ID or personal documents.
        </p>

        {/* Error Display */}
        {error && (
          <div className="mt-3 flex items-center gap-1.5 p-2 bg-red-950/40 border border-red-800/50 rounded-lg text-red-300 text-xs text-left">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="py-2.5 px-3 rounded-xl font-medium bg-white/10 hover:bg-white/15 text-white/80 transition-colors disabled:opacity-50 text-xs"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirm}
            disabled={loading}
            className="py-2.5 px-3 rounded-xl font-semibold bg-[#E50914] hover:bg-[#B80710] text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 text-xs"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking...</span>
              </>
            ) : (
              <span>I am 18+</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
