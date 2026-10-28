import { ArrowLeft, FileText, CheckCircle2 } from 'lucide-react';
import { APP_IDENTITY } from '@/config/appIdentity';

interface TermsScreenProps {
  onBack: () => void;
}

export function TermsScreen({ onBack }: TermsScreenProps) {
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
          <h1 className="text-xl font-bold text-white">Terms of Service</h1>
        </div>

        <div className="space-y-4 text-sm leading-relaxed text-white/80">
          <div className="rounded-card bg-surface-raised p-4">
            <div className="flex items-center gap-2 mb-2 text-accent font-semibold">
              <FileText className="h-4 w-4" />
              <span>Welcome to {APP_IDENTITY.name}</span>
            </div>
            <p className="text-xs text-white/60">
              Last updated: October 2026. By accessing or using {APP_IDENTITY.name}, you agree to these terms.
            </p>
          </div>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">1. Eligibility & Accounts</h2>
            <p className="text-xs text-white/70">
              You must be at least 13 years old to use {APP_IDENTITY.name}. You are responsible for safeguarding your credentials and all activities occurring under your account.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">2. Content Guidelines & Moderation</h2>
            <p className="text-xs text-white/70">
              You retain ownership of video content you upload. By posting, you grant {APP_IDENTITY.name} a license to host, transcode, and stream your content.
            </p>
            <p className="text-xs text-white/70">
              Prohibited content includes harassment, violence, explicit pornography, illegal activities, and intellectual property infringement. Violations result in immediate content removal and account termination.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">3. Subscriptions & Payments</h2>
            <p className="text-xs text-white/70">
              {APP_IDENTITY.name} Pro provides an ad-free viewing experience and additional creator capabilities. Subscriptions paid via Mobile Money (Moolre/Paystack) or Card (Stripe) are activated for 30 days upon confirmed verification.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">4. Account Deletion & Termination</h2>
            <p className="text-xs text-white/70">
              You may delete your account and associated data at any time through the in-app Settings. We reserve the right to suspend or terminate accounts that breach these terms.
            </p>
          </section>

          <div className="p-4 flex items-center gap-2 text-xs text-white/50">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span>Questions? Contact us at {APP_IDENTITY.supportEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
