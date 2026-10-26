import type { UserTier } from '@/types';
import { APP_IDENTITY } from '@/config/appIdentity';

const DAILY_LIMIT_MS = 60 * 60 * 1000;
const WARNING_AT_MS = 10 * 60 * 1000; // warn when 10 minutes remain
const STORAGE_KEY = APP_IDENTITY.storageKeys.viewingBudget;

interface StoredState {
  date: string; // YYYY-MM-DD
  viewedMs: number;
  warned: boolean;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function load(): StoredState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw && APP_IDENTITY.storageKeys.legacyViewingBudget) {
      for (const legacyKey of APP_IDENTITY.storageKeys.legacyViewingBudget) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as StoredState;
      if (parsed.date === today()) return parsed;
    }
  } catch {
    // corrupted or unavailable storage — start fresh
  }
  return { date: today(), viewedMs: 0, warned: false };
}

function save(state: StoredState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode) — limit simply won't persist
  }
}

export interface ViewingBudget {
  /** ms of viewing left today; 0 when the wall is up */
  remainingMs: number;
  /** true once the guest has exhausted the daily budget */
  exhausted: boolean;
  /** true when the guest is within the warning window */
  nearLimit: boolean;
}

export type { ViewingBudgetTracker };

class ViewingBudgetTracker {
  private state: StoredState = load();
  private tick: ReturnType<typeof setInterval> | null = null;

  constructor(private tier: UserTier) {}

  /** Start counting active viewing time (call when the feed is the active view). */
  start(): void {
    if (this.tier !== 'anonymous' || this.tick) return;
    this.tick = setInterval(() => {
      this.state = load();
      this.state.viewedMs += 1000;
      save(this.state);
    }, 1000);
  }

  stop(): void {
    if (this.tick) {
      clearInterval(this.tick);
      this.tick = null;
    }
  }

  /** Advance the counter directly (used by tests and future server sync). */
  spend(ms: number): void {
    this.state = load();
    this.state.viewedMs += ms;
    save(this.state);
  }

  snapshot(): ViewingBudget {
    this.state = load();
    const remainingMs = Math.max(0, DAILY_LIMIT_MS - this.state.viewedMs);
    return {
      remainingMs,
      exhausted: remainingMs <= 0,
      nearLimit: remainingMs > 0 && remainingMs <= WARNING_AT_MS,
    };
  }
}

export function createViewingBudget(tier: UserTier): ViewingBudgetTracker {
  return new ViewingBudgetTracker(tier);
}

export const VIEWING_LIMIT_MINUTES = DAILY_LIMIT_MS / 60000;
