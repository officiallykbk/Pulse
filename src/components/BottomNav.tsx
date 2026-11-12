import { Home, Upload, User } from 'lucide-react';

export type View = 'home' | 'upload' | 'profile' | 'search' | 'settings' | 'support' | 'editProfile' | 'admin' | 'terms' | 'privacy';

interface BottomNavProps {
  activeView: View;
  onChange: (view: View) => void;
  disabled?: boolean;
}

export function BottomNav({ activeView, onChange, disabled }: BottomNavProps) {
  const items: { view: View; icon: typeof Home; label: string }[] = [
    { view: 'home', icon: Home, label: 'Feed' },
    { view: 'upload', icon: Upload, label: 'Upload' },
    { view: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav
      className={`bottom-nav phone-only absolute bottom-0 left-0 right-0 z-50 items-center justify-around border-t border-white/10 bg-black/90 px-2 backdrop-blur-lg transition-opacity duration-300 ${
        disabled ? 'pointer-events-none opacity-40 select-none cursor-not-allowed' : ''
      }`}
      aria-label="Main navigation"
      aria-disabled={disabled}
    >
      {items.map(({ view, icon: Icon, label }) => {
        const active = view === activeView;
        return (
          <button
            key={view}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChange(view);
            }}
            aria-current={active ? 'page' : undefined}
            className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5"
          >
            {view === 'upload' ? (
              <span className={`flex h-8 w-12 items-center justify-center rounded-lg transition ${active ? 'bg-accent text-white' : 'bg-white text-black shadow-[-3px_0_0_#E50914,3px_0_0_#42d6e8]'}`}>
                <Icon className="h-5 w-5" strokeWidth={2.4} />
              </span>
            ) : (
              <Icon
                className={`h-6 w-6 transition-colors ${active ? 'text-white' : 'text-white/45'}`}
                strokeWidth={active ? 2.5 : 2}
              />
            )}
            <span
              className={`text-[10px] transition-colors ${active ? 'text-white' : 'text-white/45'}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
