/**
 * UI Session State Management for Pulse.
 *
 * Backed by `sessionStorage` under `pulse:ui_session:v1`.
 * Stores exclusively tab-lifetime non-sensitive UI state:
 * - active view/tab
 * - active feed item index
 * - search query
 * - conversion / auth intent reason
 * - pending non-sensitive action ID
 *
 * Strictly prohibits passwords, payment fields, tokens, age status, or personal information.
 */

export const UI_SESSION_STORAGE_KEY = 'pulse:ui_session:v1';

export interface UiSessionState {
  activeTab?: string;
  feedIndex?: number;
  searchQuery?: string;
  modalReason?: string;
  pendingActionId?: string;
}

export interface UiSessionAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PROHIBITED_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'cardNumber',
  'cvv',
  'pin',
  'phoneNumber',
  'email',
  'age',
  'age_verified',
]);

function getBrowserSessionStorage(): UiSessionAdapter | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage;
    }
  } catch {
    // Storage restricted
  }
  return null;
}

export interface UiSessionModule {
  load(): UiSessionState;
  update(patch: Partial<UiSessionState>): void;
  clear(): void;
}

export class UiSessionManager implements UiSessionModule {
  private adapter: UiSessionAdapter | null;

  constructor(adapter?: UiSessionAdapter | null) {
    this.adapter = adapter !== undefined ? adapter : getBrowserSessionStorage();
  }

  setStorageAdapter(adapter: UiSessionAdapter | null): void {
    this.adapter = adapter;
  }

  load(): UiSessionState {
    if (!this.adapter) return {};
    try {
      const raw = this.adapter.getItem(UI_SESSION_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<UiSessionState>;
      if (typeof parsed !== 'object' || parsed === null) return {};

      // Filter prohibited or unrecognized keys
      const safeState: UiSessionState = {};
      if (typeof parsed.activeTab === 'string') safeState.activeTab = parsed.activeTab.slice(0, 50);
      if (typeof parsed.feedIndex === 'number' && Number.isFinite(parsed.feedIndex)) {
        safeState.feedIndex = Math.max(0, Math.floor(parsed.feedIndex));
      }
      if (typeof parsed.searchQuery === 'string') safeState.searchQuery = parsed.searchQuery.slice(0, 200);
      if (typeof parsed.modalReason === 'string') safeState.modalReason = parsed.modalReason.slice(0, 100);
      if (typeof parsed.pendingActionId === 'string') safeState.pendingActionId = parsed.pendingActionId.slice(0, 100);

      return safeState;
    } catch {
      return {};
    }
  }

  update(patch: Partial<UiSessionState>): void {
    if (!this.adapter) return;

    // Reject prohibited sensitive properties
    for (const key of Object.keys(patch)) {
      if (PROHIBITED_KEYS.has(key)) {
        throw new Error(`Security Violation: Prohibited property "${key}" in UI session state.`);
      }
    }

    try {
      const current = this.load();
      const updated: UiSessionState = {
        ...current,
        ...patch,
      };

      this.adapter.setItem(UI_SESSION_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore quota or write failures
    }
  }

  clear(): void {
    if (!this.adapter) return;
    try {
      this.adapter.removeItem(UI_SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

export const uiSession = new UiSessionManager();
