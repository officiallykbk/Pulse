import { useState } from 'react';
import { ArrowLeft, MessageSquarePlus, Bug, Lightbulb, Check } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { APP_IDENTITY } from '@/config/appIdentity';

interface SupportScreenProps {
  onBack: () => void;
}

type Category = 'general' | 'bug' | 'feature';

const FAQ_ITEMS = [
  {
    q: 'Why do I see ads?',
    a: APP_IDENTITY.faq.adNotice,
  },
  {
    q: 'How do I get fewer ads?',
    a: 'Register a free account (one ad per 10 videos) or upgrade to Pro for a completely ad-free experience.',
  },
  {
    q: 'My video is not appearing in the feed. Why?',
    a: 'New uploads are reviewed before appearing in the public feed. You will be notified once it is approved.',
  },
  {
    q: 'How do payments work?',
    a: 'Pro subscriptions cost GHS 10/month and are billed via Paystack Mobile Money (MTN, Vodafone, AirtelTigo) or card.',
  },
];

export function SupportScreen({ onBack }: SupportScreenProps) {
  const [category, setCategory] = useState<Category>('general');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from('feedback').insert({
      user_id: user?.id ?? null,
      email: email.trim() || user?.email || null,
      category,
      message: message.trim(),
    });

    setSending(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSent(true);
    setMessage('');
    setTimeout(() => setSent(false), 3000);
  };

  const CATEGORIES: { value: Category; label: string; icon: typeof MessageSquarePlus }[] = [
    { value: 'general', label: 'General', icon: MessageSquarePlus },
    { value: 'bug', label: 'Bug report', icon: Bug },
    { value: 'feature', label: 'Feature idea', icon: Lightbulb },
  ];

  return (
    <div className="min-h-full bg-black px-4 pb-24" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Support</h1>
        </div>

        {sent && (
          <div className="mb-4 flex items-center gap-3 rounded-card bg-success/15 px-4 py-3">
            <Check className="h-5 w-5 text-success" />
            <span className="text-sm font-medium text-success">Message sent — we read everything</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mb-6 space-y-4">
          <div className="flex gap-2">
            {CATEGORIES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategory(value)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-3 text-xs font-medium transition-colors ${
                  category === value ? 'bg-surface-raised text-white' : 'text-white/40'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required
            maxLength={2000}
            placeholder="Tell us what's on your mind..."
            className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
          />

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email (optional, for a reply)"
            className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
          />

          {error && (
            <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors active:bg-accent-hover disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Frequently Asked</h2>
        <div className="divide-y divide-white/5 rounded-card bg-surface-raised">
          {FAQ_ITEMS.map((item, i) => (
            <div key={item.q}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full px-4 py-3.5 text-left text-sm font-medium text-white"
              >
                {item.q}
              </button>
              {openFaq === i && (
                <p className="px-4 pb-4 text-sm leading-relaxed text-white/60">{item.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
