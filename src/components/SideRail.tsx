import { Home, Upload, User } from 'lucide-react';
import type { View } from '@/components/BottomNav';

interface SideRailProps {
  activeView: View;
  onChange: (view: View) => void;
  disabled?: boolean;
}

const ITEMS: { view: View; icon: typeof Home; label: string }[] = [
  { view: 'home', icon: Home, label: 'Feed' },
  { view: 'upload', icon: Upload, label: 'Upload' },
  { view: 'profile', icon: User, label: 'Profile' },
];

export function SideRail({ activeView, onChange, disabled }: SideRailProps) {
  return (
    <nav
      className={`side-rail transition-opacity duration-300 ${
        disabled ? 'pointer-events-none opacity-40 select-none cursor-not-allowed' : ''
      }`}
      aria-label="Main navigation"
      aria-disabled={disabled}
    >
      {ITEMS.map(({ view, icon: Icon, label }) => {
        const active = view === activeView;
        return (
          <button
            key={view}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(view);
            }}
            className="flex w-full flex-col items-center gap-1 rounded-xl py-3 transition-colors hover:bg-white/5"
            aria-current={active ? 'page' : undefined}
          >
            <Icon
              className={`h-6 w-6 transition-colors ${active ? 'text-accent' : 'text-white/50'}`}
              strokeWidth={active ? 2.5 : 2}
            />
            <span
              className={`text-[11px] transition-colors ${active ? 'text-white' : 'text-white/50'}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
