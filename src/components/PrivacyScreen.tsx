import { ArrowLeft, Shield, CheckCircle2, Lock, Clock, EyeOff, RefreshCw } from 'lucide-react';
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
              <span>Trust-First, Privacy-First Architecture</span>
            </div>
            <p className="text-xs text-white/60">
              Last updated: October 2026. This policy explains how {APP_IDENTITY.name} protects your privacy, minimizes data collection, and gives you total control over your digital footprint.
            </p>
          </div>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white text-base">
              <Clock className="h-4 w-4 text-accent" />
              <h2>1. Guest Browsing & 24-Hour Local Retention</h2>
            </div>
            <p className="text-xs text-white/70">
              You can explore and watch videos on {APP_IDENTITY.name} without an account. When browsing as a guest:
            </p>
            <p className="text-xs text-white/70">
              - <strong>Local Storage Only:</strong> Your saved videos and playback progress are stored strictly on your device.
            </p>
            <p className="text-xs text-white/70">
              - <strong>24-Hour Expiration:</strong> All guest saves and progress automatically expire and are purged from your device 24 hours after being recorded.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Zero Surveillance:</strong> We do not run background engagement timers, cross-site trackers, or guest surveillance scripts.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white text-base">
              <EyeOff className="h-4 w-4 text-accent" />
              <h2>2. Zero-PII Age Verification</h2>
            </div>
            <p className="text-xs text-white/70">
              To view age-restricted culture and mature creative content:
            </p>
            <p className="text-xs text-white/70">
              - <strong>Zero Personal Information:</strong> We do not collect your identity cards, birth date, name, or phone number.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Cryptographic Declaration:</strong> Confirming you are 18+ generates an opaque, random 32-byte affirmation token stored in an encrypted HttpOnly cookie for 30 days.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Private Segregated Media:</strong> Restricted videos are kept in private, access-controlled storage delivered via short-lived signed URLs.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white text-base">
              <RefreshCw className="h-4 w-4 text-accent" />
              <h2>3. Seamless Account Synchronization</h2>
            </div>
            <p className="text-xs text-white/70">
              When you decide to create an account or sign in:
            </p>
            <p className="text-xs text-white/70">
              - <strong>Automatic Sync:</strong> Your existing guest saves and progress items are seamlessly synchronized to your private account.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Instant Local Purge:</strong> Once synced, guest data is cleared from your local storage to prevent data lingering on shared devices.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-white text-base">
              <Lock className="h-4 w-4 text-accent" />
              <h2>4. Information We Collect For Registered Accounts</h2>
            </div>
            <p className="text-xs text-white/70">
              - <strong>Account details:</strong> Email address and authentication credentials. Session tokens are held exclusively in secure HttpOnly cookies and never exposed to browser scripts.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Profile & Content:</strong> Display name, bio, avatar, and videos you choose to upload.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Aggregated Telemetry:</strong> Public view counts, likes, and comments necessary to operate community feeds.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">5. Payment Security</h2>
            <p className="text-xs text-white/70">
              We never store or view your credit card numbers or Mobile Money PINs. Transactions are processed directly by certified third-party payment gateways (Moolre, Paystack, Stripe) subject to strict PCI-DSS compliance.
            </p>
          </section>

          <section className="rounded-card bg-surface-raised p-4 space-y-2">
            <h2 className="font-semibold text-white text-base">6. Your Rights (Ghana Data Protection Act 2012)</h2>
            <p className="text-xs text-white/70">
              In accordance with Ghana Act 843 and international standards, you have absolute ownership of your data:
            </p>
            <p className="text-xs text-white/70">
              - <strong>Machine-Readable Export:</strong> Download a full JSON archive of your profile, uploads, likes, and comments directly in Settings.
            </p>
            <p className="text-xs text-white/70">
              - <strong>Permanent Deletion:</strong> Instantly and irreversibly erase your account, uploaded media, and activity records in Settings.
            </p>
          </section>

          <div className="p-4 flex items-center gap-2 text-xs text-white/50">
            <CheckCircle2 className="h-4 w-4 text-accent" />
            <span>Data Protection Officer: {APP_IDENTITY.supportEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
