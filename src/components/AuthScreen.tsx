import { useState } from 'react';
import { X, Mail, Lock } from 'lucide-react';

interface AuthScreenProps {
  open: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<{ error: string | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error: string | null }>;
}

export function AuthScreen({ open, onClose, onSignIn, onSignUp }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fn = mode === 'signin' ? onSignIn : onSignUp;
    const { error: err } = await fn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-card bg-surface-raised p-6 mx-4">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 text-xl font-bold text-white">
          {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="mb-6 text-sm text-white/50">
          {mode === 'signin' ? 'Sign in to reduce ads' : 'Register for fewer ads and upload videos'}
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Email</label>
            <div className="flex items-center rounded-lg bg-surface-elevated ring-1 ring-white/10 focus-within:ring-accent">
              <Mail className="ml-3 h-4 w-4 text-white/40" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-transparent px-3 py-3 text-white placeholder-white/30 outline-none"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Password</label>
            <div className="flex items-center rounded-lg bg-surface-elevated ring-1 ring-white/10 focus-within:ring-accent">
              <Lock className="ml-3 h-4 w-4 text-white/40" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-transparent px-3 py-3 text-white placeholder-white/30 outline-none"
                placeholder="Min 6 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-accent py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="mt-4 w-full text-center text-sm text-white/50 transition-colors hover:text-white"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
