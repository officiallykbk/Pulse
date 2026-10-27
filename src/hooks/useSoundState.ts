/**
 * Pulse Platform: In-Session Sound & Mute State Manager
 *
 * Guarantees that videos ALWAYS start muted on page load or refresh to prevent
 * accidental loud audio in public spaces. In-session unmute persists across
 * swiped videos, but immediately resets to muted on any page refresh.
 */

import { useState, useEffect } from 'react';
import { feedActions } from '@/lib/feedActions';

// In-memory state: always starts as TRUE on initial load or refresh
let globalMuted = true;
const listeners = new Set<(muted: boolean) => void>();

export function getIsMuted(): boolean {
  return globalMuted;
}

export function setIsMuted(muted: boolean): void {
  globalMuted = muted;
  listeners.forEach((listener) => listener(globalMuted));
}

export function toggleGlobalMute(): boolean {
  const next = !globalMuted;
  setIsMuted(next);
  return next;
}

// Hook for components to read and toggle mute state reactively
export function useSoundState() {
  const [isMuted, setLocalMuted] = useState<boolean>(globalMuted);

  useEffect(() => {
    // Sync current global state on mount
    setLocalMuted(globalMuted);

    const listener = (muted: boolean) => {
      setLocalMuted(muted);
    };

    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    isMuted,
    toggleMute: toggleGlobalMute,
    setMuted: setIsMuted,
  };
}

// Global listener for keyboard shortcut 'm'
feedActions.on('mute', () => {
  toggleGlobalMute();
});
