/**
 * Daily Activity Tracker for Pulse.
 *
 * Implements privacy-first, minimal foreground activity marking:
 * - Triggered ONLY when foreground playback begins or active feed interaction occurs.
 * - Strictly guarded by `document.visibilityState === 'visible'`; background tabs never mark activity.
 * - Writes at most ONCE per local calendar day (YYYY-MM-DD).
 * - Zero timers, intervals, heartbeats, continuous background tasks, or elapsed minute counters.
 * - Stored within the privacy-bounded 24-hour anonymous state envelope for guests.
 * - No permanent engagement surveillance or continuous tracking.
 */

import { anonymousState } from './anonymousState';

export interface DailyActivitySnapshot {
  activeToday: boolean;
  lastActiveDate: string | null;
}

export interface DailyActivityModule {
  markActive(): boolean;
  snapshot(): DailyActivitySnapshot;
  resetForTesting(): void;
}

export class DailyActivityManager implements DailyActivityModule {
  private nowFn: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn;
  }

  setClock(nowFn: () => number): void {
    this.nowFn = nowFn;
  }

  /**
   * Marks foreground daily activity.
   * Returns true if activity was newly recorded for today; false if already recorded or in background.
   */
  markActive(): boolean {
    // 1. Guard against background tabs
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return false;
    }

    // 2. Local calendar date format YYYY-MM-DD
    const today = new Date(this.nowFn()).toISOString().slice(0, 10);
    const last = anonymousState.getLastActiveDate();

    // 3. Write at most once per calendar day
    if (last === today) {
      return false;
    }

    return anonymousState.markDailyActivity(today);
  }

  snapshot(): DailyActivitySnapshot {
    const today = new Date(this.nowFn()).toISOString().slice(0, 10);
    const last = anonymousState.getLastActiveDate();
    return {
      activeToday: last === today,
      lastActiveDate: last,
    };
  }

  resetForTesting(): void {
    anonymousState.clearAll();
  }
}

export const dailyActivity = new DailyActivityManager();
