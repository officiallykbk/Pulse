/**
 * Anonymous State Management for Pulse.
 *
 * Implements the AnonymousStateModule interface under key `pulse:anonymous:v1`:
 * - Max 5 saved video IDs
 * - Max 50 progress / watch history entries
 * - Per-entry 24-hour expiration (86,400s)
 * - Numeric clamping and strict schema validation
 * - Pruning on every read, write, and bootstrap
 * - Zero PII, profile data, or descriptions
 */

import { type TtlStorageAdapter } from './ttlStorage';

export const ANONYMOUS_STORAGE_KEY = 'pulse:anonymous:v1';
export const MAX_ANONYMOUS_SAVES = 5;
export const MAX_ANONYMOUS_PROGRESS = 50;
export const ANONYMOUS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface AnonymousSaveEntry {
  videoId: string;
  savedAt: string;
  expiresAt: string;
}

export interface AnonymousProgressEntry {
  videoId: string;
  positionSeconds: number;
  completed: boolean;
  updatedAt: string;
  expiresAt: string;
}

export interface AnonymousRawState {
  version: 1;
  saved: AnonymousSaveEntry[];
  progress: AnonymousProgressEntry[];
  lastActiveDate?: string;
}

export interface AnonymousSnapshot {
  savedIds: string[];
  saved: AnonymousSaveEntry[];
  progress: AnonymousProgressEntry[];
}

export interface SaveResult {
  saved: boolean;
  limitReached: boolean;
}

export interface AnonymousSyncPayload {
  savedVideoIds: string[];
  progress: Array<{
    videoId: string;
    positionSeconds: number;
    completed: boolean;
    updatedAt: string;
  }>;
}

export interface AnonymousSyncResult {
  acknowledgedSavedIds: string[];
  acknowledgedProgressVideoIds: string[];
}

export interface AnonymousStateModule {
  snapshot(): AnonymousSnapshot;
  toggleSaved(videoId: string): SaveResult;
  isSaved(videoId: string): boolean;
  recordProgress(videoId: string, positionSeconds: number, completed: boolean): void;
  getProgress(videoId: string): { positionSeconds: number; completed: boolean } | null;
  clearHistory(): void;
  clearAll(): void;
  buildSyncPayload(): AnonymousSyncPayload;
  acknowledgeSync(result: AnonymousSyncResult): void;
  subscribe(listener: () => void): () => void;
}

function getBrowserStorage(): TtlStorageAdapter | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Storage access restricted
  }
  return null;
}

export class AnonymousStateManager implements AnonymousStateModule {
  private adapter: TtlStorageAdapter | null;
  private nowFn: () => number;
  private listeners = new Set<() => void>();

  constructor(adapter?: TtlStorageAdapter | null, nowFn: () => number = () => Date.now()) {
    this.adapter = adapter !== undefined ? adapter : getBrowserStorage();
    this.nowFn = nowFn;
  }

  setStorageAdapter(adapter: TtlStorageAdapter | null): void {
    this.adapter = adapter;
  }

  setClock(nowFn: () => number): void {
    this.nowFn = nowFn;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('AnonymousStateManager listener error:', err);
      }
    }
  }

  /**
   * Internal read with schema validation, numeric clamping, and expired entry pruning.
   */
  private readState(): AnonymousRawState {
    const defaultState: AnonymousRawState = {
      version: 1,
      saved: [],
      progress: [],
    };

    if (!this.adapter) return defaultState;

    try {
      const raw = this.adapter.getItem(ANONYMOUS_STORAGE_KEY);
      if (!raw) return defaultState;

      const parsed = JSON.parse(raw) as Partial<AnonymousRawState>;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.saved) || !Array.isArray(parsed.progress)) {
        return defaultState;
      }

      const now = this.nowFn();
      let stateChanged = false;

      // Validate & prune saved entries
      const validSaved: AnonymousSaveEntry[] = [];
      for (const item of parsed.saved) {
        if (
          typeof item?.videoId === 'string' &&
          typeof item?.expiresAt === 'string' &&
          typeof item?.savedAt === 'string'
        ) {
          const expTime = new Date(item.expiresAt).getTime();
          if (expTime > now) {
            validSaved.push({
              videoId: String(item.videoId).slice(0, 100),
              savedAt: item.savedAt,
              expiresAt: item.expiresAt,
            });
          } else {
            stateChanged = true;
          }
        } else {
          stateChanged = true;
        }
      }

      // Validate & prune progress entries
      const validProgress: AnonymousProgressEntry[] = [];
      for (const item of parsed.progress) {
        if (
          typeof item?.videoId === 'string' &&
          typeof item?.expiresAt === 'string' &&
          typeof item?.updatedAt === 'string' &&
          typeof item?.positionSeconds === 'number'
        ) {
          const expTime = new Date(item.expiresAt).getTime();
          if (expTime > now) {
            validProgress.push({
              videoId: String(item.videoId).slice(0, 100),
              positionSeconds: Math.max(0, Math.floor(item.positionSeconds)),
              completed: Boolean(item.completed),
              updatedAt: item.updatedAt,
              expiresAt: item.expiresAt,
            });
          } else {
            stateChanged = true;
          }
        } else {
          stateChanged = true;
        }
      }

      // Caps check
      const cappedSaved = validSaved.slice(-MAX_ANONYMOUS_SAVES);
      const cappedProgress = validProgress.slice(-MAX_ANONYMOUS_PROGRESS);

      if (cappedSaved.length !== validSaved.length || cappedProgress.length !== validProgress.length) {
        stateChanged = true;
      }

      const sanitizedState: AnonymousRawState = {
        version: 1,
        saved: cappedSaved,
        progress: cappedProgress,
        lastActiveDate: typeof parsed.lastActiveDate === 'string' ? parsed.lastActiveDate.slice(0, 10) : undefined,
      };

      if (stateChanged) {
        this.writeState(sanitizedState);
      }

      return sanitizedState;
    } catch {
      return defaultState;
    }
  }

  private writeState(state: AnonymousRawState): boolean {
    if (!this.adapter) return false;
    try {
      this.adapter.setItem(ANONYMOUS_STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  snapshot(): AnonymousSnapshot {
    const state = this.readState();
    return {
      savedIds: state.saved.map((s) => s.videoId),
      saved: [...state.saved],
      progress: [...state.progress],
    };
  }

  isSaved(videoId: string): boolean {
    if (!videoId) return false;
    const state = this.readState();
    return state.saved.some((entry) => entry.videoId === videoId);
  }

  toggleSaved(videoId: string): SaveResult {
    if (!videoId) return { saved: false, limitReached: false };
    const state = this.readState();
    const existingIndex = state.saved.findIndex((s) => s.videoId === videoId);

    if (existingIndex !== -1) {
      // Unsave
      state.saved.splice(existingIndex, 1);
      this.writeState(state);
      this.notify();
      return { saved: false, limitReached: false };
    }

    // Save
    if (state.saved.length >= MAX_ANONYMOUS_SAVES) {
      // Reached 5 saved limit! Conversion modal trigger required
      return { saved: false, limitReached: true };
    }

    const now = this.nowFn();
    const newEntry: AnonymousSaveEntry = {
      videoId,
      savedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ANONYMOUS_TTL_MS).toISOString(),
    };

    state.saved.push(newEntry);
    this.writeState(state);
    this.notify();
    return { saved: true, limitReached: false };
  }

  recordProgress(videoId: string, positionSeconds: number, completed: boolean): void {
    if (!videoId) return;
    const state = this.readState();
    const now = this.nowFn();
    const pos = Math.max(0, Math.floor(positionSeconds));

    const existingIndex = state.progress.findIndex((p) => p.videoId === videoId);
    const newEntry: AnonymousProgressEntry = {
      videoId,
      positionSeconds: pos,
      completed,
      updatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ANONYMOUS_TTL_MS).toISOString(),
    };

    if (existingIndex !== -1) {
      state.progress[existingIndex] = newEntry;
    } else {
      state.progress.push(newEntry);
      if (state.progress.length > MAX_ANONYMOUS_PROGRESS) {
        state.progress = state.progress.slice(-MAX_ANONYMOUS_PROGRESS);
      }
    }

    this.writeState(state);
    this.notify();
  }

  getProgress(videoId: string): { positionSeconds: number; completed: boolean } | null {
    if (!videoId) return null;
    const state = this.readState();
    const entry = state.progress.find((p) => p.videoId === videoId);
    if (!entry) return null;
    return {
      positionSeconds: entry.positionSeconds,
      completed: entry.completed,
    };
  }

  clearHistory(): void {
    const state = this.readState();
    state.progress = [];
    this.writeState(state);
    this.notify();
  }

  clearAll(): void {
    if (this.adapter) {
      try {
        this.adapter.removeItem(ANONYMOUS_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
    this.notify();
  }

  buildSyncPayload(): AnonymousSyncPayload {
    const state = this.readState();
    return {
      savedVideoIds: state.saved.map((s) => s.videoId),
      progress: state.progress.map((p) => ({
        videoId: p.videoId,
        positionSeconds: p.positionSeconds,
        completed: p.completed,
        updatedAt: p.updatedAt,
      })),
    };
  }

  acknowledgeSync(result: AnonymousSyncResult): void {
    const state = this.readState();
    const ackSaved = new Set(result.acknowledgedSavedIds || []);
    const ackProgress = new Set(result.acknowledgedProgressVideoIds || []);

    state.saved = state.saved.filter((s) => !ackSaved.has(s.videoId));
    state.progress = state.progress.filter((p) => !ackProgress.has(p.videoId));

    this.writeState(state);
    this.notify();
  }

  markDailyActivity(dateStr?: string): boolean {
    const today = dateStr || new Date(this.nowFn()).toISOString().slice(0, 10);
    const state = this.readState();
    if (state.lastActiveDate === today) {
      return false;
    }
    state.lastActiveDate = today;
    this.writeState(state);
    this.notify();
    return true;
  }

  getLastActiveDate(): string | null {
    const state = this.readState();
    return state.lastActiveDate || null;
  }
}

export const anonymousState = new AnonymousStateManager();
