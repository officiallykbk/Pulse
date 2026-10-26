import { Home, Upload, User } from 'lucide-react';

export type View = 'home' | 'upload' | 'profile' | 'search' | 'settings' | 'support' | 'editProfile';

interface BottomNavProps {
  activeView: View;
  onChange: (view: View) => void;
}

export function BottomNav({ activeView, onChange }: BottomNavProps) {
  const items: { view: View; icon: typeof Home; label: string }[] = [
    { view: 'home', icon: Home, label: 'Feed' },
    { view: 'upload', icon: Upload, label: 'Upload' },
    { view: 'profile', icon: User, label: 'Profile' },
  ];

  return (
    <nav
      className="phone-only absolute bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/10 bg-black/90 px-2 py-2 backdrop-blur-lg"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {items.map(({ view, icon: Icon, label }) => {
        const active = view === activeView;
        return (
          <button
            key={view}
            onClick={() => onChange(view)}
            className="flex flex-1 flex-col items-center gap-0.5 py-1"
          >
            <Icon
              className={`h-6 w-6 transition-colors ${active ? 'text-white' : 'text-white/40'}`}
              strokeWidth={active ? 2.5 : 2}
            />
            <span
              className={`text-[10px] transition-colors ${active ? 'text-white' : 'text-white/40'}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
