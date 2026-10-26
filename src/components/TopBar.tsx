import { Search, Crown } from 'lucide-react';
import type { UserTier } from '@/types';
import { APP_IDENTITY } from '@/config/appIdentity';

interface TopBarProps {
  tier: UserTier;
  onUpgrade: () => void;
  onSearch: () => void;
}

export function TopBar({ tier, onUpgrade, onSearch }: TopBarProps) {
  return (
    <div
      className="absolute top-0 left-0 right-0 z-40 flex items-center justify-between px-4 pb-2 bg-gradient-to-b from-black/60 to-transparent"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
          <span className="text-xs font-black text-white">{APP_IDENTITY.logo.symbol}</span>
        </div>
        <span className="text-sm font-bold tracking-tight text-white">
          {APP_IDENTITY.logo.text}
          {APP_IDENTITY.logo.accentWord && (
            <span className="text-accent">{APP_IDENTITY.logo.accentWord}</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSearch}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-colors active:bg-white/20"
        >
          <Search className="h-4 w-4 text-white" />
        </button>
        {tier !== 'pro' && (
          <button
            onClick={onUpgrade}
            className="flex items-center gap-1.5 rounded-full bg-accent/90 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors active:bg-accent"
          >
            <Crown className="h-3.5 w-3.5" />
            Pro
          </button>
        )}
      </div>
    </div>
  );
}
