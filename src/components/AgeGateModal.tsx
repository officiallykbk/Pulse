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
      <div className="relative w-full max-w-md bg-[#121212] border border-neutral-800 rounded-2xl p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Close"
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Shield Icon Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 id="age-gate-title" className="text-lg font-bold text-white">
              18+ Content Confirmation
            </h2>
            <p className="text-xs text-neutral-400">Privacy-First Self Declaration</p>
          </div>
        </div>

        {/* Explanatory Content */}
        <div className="space-y-3 mb-6 text-sm text-neutral-300">
          {contentTitle && (
            <p className="font-semibold text-white truncate">
              Content: &ldquo;{contentTitle}&rdquo;
            </p>
          )}

          <p>
            This content is intended exclusively for viewers aged 18 and older.
          </p>

          <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-xs space-y-1.5 text-neutral-400">
            <p className="font-medium text-neutral-300">🔒 Trust &amp; Privacy Notice:</p>
            <p>
              Pulse does not collect your ID, government documents, payment cards, birthdate, or
              personal identifiers.
            </p>
            <p>
              Confirming sets a private 30-day token on this device to grant access to 18+ content.
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-semibold bg-[#E50914] hover:bg-[#B80710] text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Affirming...</span>
              </>
            ) : (
              <span>I am 18+</span>
            )}
          </button>

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors disabled:opacity-50 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
