import { Bookmark, Clock, Upload, Sparkles, X } from 'lucide-react';

export type AuthIntent = 'save-limit' | 'ttl-expired' | 'upload' | 'default';

export interface TrustConversionModalProps {
  open: boolean;
  intent?: AuthIntent;
  onClose: () => void;
  onContinueToAuth: (intent: AuthIntent) => void;
}

interface IntentContent {
  icon: typeof Bookmark;
  title: string;
  badge: string;
  description: string;
  benefit: string;
  actionText: string;
}

const INTENT_MAP: Record<AuthIntent, IntentContent> = {
  'save-limit': {
    icon: Bookmark,
    badge: 'Device Limit Reached',
    title: 'Keep your saved videos permanently',
    description:
      'You have saved 5 videos on this device (temporary 24-hour limit). Sign up to save your content permanently and continue on other devices.',
    benefit: 'No credit card required · Unlimited saves · Instant cross-device sync',
    actionText: 'Sign Up to Save Permanently',
  },
  'ttl-expired': {
    icon: Clock,
    badge: '24-Hour Expiry',
    title: 'Never lose your favorite videos',
    description:
      'Anonymous bookmarks and watch history expire after 24 hours on this device. Sign up for a free account to keep your favorites forever.',
    benefit: 'Automatic permanent history · Cross-device sync · Fast & free',
    actionText: 'Create Account to Keep Content',
  },
  upload: {
    icon: Upload,
    badge: 'Creator Account',
    title: 'Share your videos with the community',
    description:
      'Sign in or create a free account to upload high-quality videos, track views, and connect with viewers worldwide.',
    benefit: 'ABR Adaptive Streaming · Creator Dashboard · Monetization tools',
    actionText: 'Create Free Account',
  },
  default: {
    icon: Sparkles,
    badge: 'Join Pulse',
    title: 'Unlock the complete Pulse experience',
    description:
      'Save unlimited videos, sync your watch progress across all your devices, and engage with your favorite creators.',
    benefit: '100% Free · Respects your privacy · No tracking algorithms',
    actionText: 'Sign In or Register',
  },
};

export function TrustConversionModal({
  open,
  intent = 'default',
  onClose,
  onContinueToAuth,
}: TrustConversionModalProps) {
  if (!open) return null;

  const content = INTENT_MAP[intent] || INTENT_MAP.default;
  const IconComponent = content.icon;

  const handleAction = () => {
    onContinueToAuth(intent);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversion-modal-title"
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-sm bg-[#121212] border border-neutral-800 rounded-2xl p-6 shadow-2xl text-white">
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500">
            <IconComponent className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
              {content.badge}
            </span>
          </div>
        </div>

        {/* Title & Copy */}
        <h2 id="conversion-modal-title" className="text-lg font-bold text-white mb-2 leading-snug">
          {content.title}
        </h2>
        <p className="text-xs text-neutral-300 leading-relaxed mb-4">
          {content.description}
        </p>

        {/* Trust & Benefit Callout */}
        <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-[11px] text-neutral-400 mb-6">
          <p className="text-neutral-300 font-medium">✨ Privacy-First Guarantee</p>
          <p className="mt-0.5">{content.benefit}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleAction}
            className="w-full py-3 px-4 rounded-xl font-semibold bg-[#E50914] hover:bg-[#B80710] text-white text-sm transition-colors shadow-lg active:scale-95 text-center"
          >
            {content.actionText}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs transition-colors"
          >
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
}
