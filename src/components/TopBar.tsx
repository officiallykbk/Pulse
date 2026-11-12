import { Search, Crown } from 'lucide-react';
import type { UserTier } from '@/types';
import { APP_IDENTITY } from '@/config/appIdentity';

interface TopBarProps {
  tier: UserTier;
  onUpgrade: () => void;
  onSearch: () => void;
  disabled?: boolean;
  hideUpgrade?: boolean;
}

export function TopBar({ tier, onUpgrade, onSearch, disabled, hideUpgrade }: TopBarProps) {
  return (
    <div
      className={`top-bar absolute left-0 right-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent px-3.5 pb-3 transition-opacity duration-300 ${
        disabled ? 'opacity-30 pointer-events-none select-none' : ''
      }`}
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      aria-disabled={disabled}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent shadow-[0_2px_10px_rgba(229,9,20,0.35)]">
          <span className="text-xs font-black tracking-tight text-white">{APP_IDENTITY.logo.symbol}</span>
        </div>
        <span className="text-[15px] font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
          {APP_IDENTITY.logo.text}
          {APP_IDENTITY.logo.accentWord && (
            <span className="text-accent">{APP_IDENTITY.logo.accentWord}</span>
          )}
        </span>
        {tier === 'pro' && (
          <span
            aria-label="Pro Member"
            className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent backdrop-blur-md"
          >
            <Crown className="h-2.5 w-2.5 text-accent" />
            <span>PRO</span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {tier !== 'pro' && !hideUpgrade && (
          <button
            onClick={onUpgrade}
            disabled={disabled}
            aria-label="Go Pro"
            className="top-upgrade flex h-10 items-center gap-1.5 rounded-full border border-accent/40 bg-black/50 px-3.5 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:border-accent hover:bg-accent/15 active:scale-95"
          >
            <Crown className="h-3.5 w-3.5 text-accent" />
            <span className="top-upgrade-label">Go Pro</span>
          </button>
        )}
        <button
          onClick={onSearch}
          disabled={disabled}
          aria-label="Search videos"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white/90 shadow-lg backdrop-blur-md transition-all hover:bg-black/65 active:scale-90"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
