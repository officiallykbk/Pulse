import { useEffect } from 'react';
import { feedActions } from '@/lib/feedActions';

const HANDLERS: Record<string, () => void> = {
  ArrowDown: () => feedActions.emit('next'),
  ArrowUp: () => feedActions.emit('prev'),
  j: () => feedActions.emit('next'),
  k: () => feedActions.emit('play-pause'),
  ' ': () => feedActions.emit('play-pause'),
  m: () => feedActions.emit('mute'),
  l: () => feedActions.emit('like'),
  c: () => feedActions.emit('comments'),
  s: () => feedActions.emit('share'),
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  );
}

/** Global keyboard shortcuts for the feed (no-op while typing in a field). */
export function useFeedKeyboardShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const handler = HANDLERS[e.key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
