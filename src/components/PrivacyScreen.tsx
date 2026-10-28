import { ArrowLeft, Shield, CheckCircle2 } from 'lucide-react';
import { APP_IDENTITY } from '@/config/appIdentity';

interface PrivacyScreenProps {
  onBack: () => void;
}

export function PrivacyScreen({ onBack }: PrivacyScreenProps) {
  return (
    <div
      className="min-h-full bg-black px-4 pb-24 text-white"
      style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}
    >
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Privacy Policy</h1>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-white/80">
          <div className="rounded-card bg-surface-raised p-4">
            <div className="flex items-center gap-2 mb-2 text-accent font-semibold">
              <Shield className="h-4 w-4" />
              <span>Your Privacy Matters</span>
            </div>
            <p className="text-xs text-white/60">
              Last updated: October 2026. This policy explains how {APP_IDENTITY.name} collects, protects, and gives you control over your personal data.
            </p>
          </div>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">1. Information We Collect</h2>
            <p className="text-xs text-white/70">
              - <strong>Account details:</strong> Email address and authentication identifiers when you register.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Profile & Content:</strong> Display name, bio, avatar, and videos uploaded to the platform.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Usage & Telemetry:</strong> Aggregated view counts, likes, and comments needed to operate the feed.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">2. Payment Data</h2>
            <p className="text-xs text-white/70">
              We never store your credit card numbers or Mobile Money PINs. Payment transactions are processed directly by certified third-party payment providers (Moolre, Paystack, Stripe).
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">3. Data Export & Account Deletion</h2>
            <p className="text-xs text-white/70">
              Under Ghana Data Protection Act 2012 (Act 843) and international privacy frameworks, you have full ownership of your data:
            </p>
            <p className="text-xs text-white/70">
              - <strong>Export:</strong> Download a full machine-readable JSON copy of your profile, videos, likes, and comments from Settings.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Delete:</strong> Permanently erase your profile, uploaded videos, and social history instantly from Settings.
            </p>
          </section>

          <div className="p-4 flex items-center gap-2 text-xs text-white/50">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span>Privacy inquiries: {APP_IDENTITY.supportEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
