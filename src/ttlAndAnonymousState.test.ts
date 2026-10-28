import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTtlItem,
  setTtlItem,
  removeTtlItem,
  pruneLegacyKeys,
  DEFAULT_TTL_MS,
  type TtlStorageAdapter,
} from './lib/ttlStorage';
import {
  AnonymousStateManager,
  ANONYMOUS_STORAGE_KEY,
  MAX_ANONYMOUS_SAVES,
  MAX_ANONYMOUS_PROGRESS,
  ANONYMOUS_TTL_MS,
} from './lib/anonymousState';
import {
  UiSessionManager,
  UI_SESSION_STORAGE_KEY,
  type UiSessionAdapter,
} from './lib/uiSessionState';
import { loadAppSettings, saveAppSettings, DEFAULT_SETTINGS } from './lib/settings';

class MockStorage implements TtlStorageAdapter, UiSessionAdapter {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }
}

describe('Phase 4: TTL-Limited Storage & Session UI State', () => {
  let mockStorage: MockStorage;
  let simulatedTime: number;
  const fakeClock = () => simulatedTime;

  beforeEach(() => {
    mockStorage = new MockStorage();
    simulatedTime = 1_700_000_000_000;
  });

  describe('ttlStorage Engine', () => {
    it('stores value with 24-hour expiration envelope', () => {
      setTtlItem('test:key', { message: 'hello' }, DEFAULT_TTL_MS, mockStorage, fakeClock);

      const raw = mockStorage.getItem('test:key');
      expect(raw).toBeTruthy();
      const parsed = JSON.parse(raw!);
      expect(parsed.value).toEqual({ message: 'hello' });
      expect(parsed.createdAt).toBe(simulatedTime);
      expect(parsed.expiresAt).toBe(simulatedTime + DEFAULT_TTL_MS);
    });

    it('returns stored value before expiration', () => {
      setTtlItem('test:key', 'active-value', DEFAULT_TTL_MS, mockStorage, fakeClock);

      // Advance by 12 hours
      simulatedTime += 12 * 60 * 60 * 1000;
      const res = getTtlItem<string>('test:key', mockStorage, fakeClock);
      expect(res).toBe('active-value');
    });

    it('automatically drops and returns null after expiration', () => {
      setTtlItem('test:key', 'expiring-value', DEFAULT_TTL_MS, mockStorage, fakeClock);

      // Advance past 24 hours
      simulatedTime += 24 * 60 * 60 * 1000 + 1;
      const res = getTtlItem<string>('test:key', mockStorage, fakeClock);
      expect(res).toBeNull();
      // Confirm removed from storage
      expect(mockStorage.getItem('test:key')).toBeNull();
    });

    it('handles corrupted JSON by dropping corrupt item and returning null', () => {
      mockStorage.setItem('test:corrupt', '{bad json');
      const res = getTtlItem('test:corrupt', mockStorage, fakeClock);
      expect(res).toBeNull();
      expect(mockStorage.getItem('test:corrupt')).toBeNull();
    });

    it('prunes untimestamped legacy keys without touching valid keys', () => {
      mockStorage.setItem('pulse:resume-position:video-old-1', '45');
      mockStorage.setItem('pulse:resume-position:video-old-2', '120');
      mockStorage.setItem('pulse_anonymous_viewing', 'true');
      mockStorage.setItem('keep_this_key', 'important');

      pruneLegacyKeys(mockStorage);

      expect(mockStorage.getItem('pulse:resume-position:video-old-1')).toBeNull();
      expect(mockStorage.getItem('pulse:resume-position:video-old-2')).toBeNull();
      expect(mockStorage.getItem('pulse_anonymous_viewing')).toBeNull();
      expect(mockStorage.getItem('keep_this_key')).toBe('important');
    });
  });

  describe('AnonymousStateManager (pulse:anonymous:v1)', () => {
    let manager: AnonymousStateManager;

    beforeEach(() => {
      manager = new AnonymousStateManager(mockStorage, fakeClock);
    });

    it('allows saving up to 5 videos silently without requiring an account', () => {
      for (let i = 1; i <= 5; i++) {
        const res = manager.toggleSaved(`video-${i}`);
        expect(res.saved).toBe(true);
        expect(res.limitReached).toBe(false);
      }

      const snapshot = manager.snapshot();
      expect(snapshot.savedIds).toHaveLength(5);
      expect(manager.isSaved('video-3')).toBe(true);
      expect(manager.isSaved('video-99')).toBe(false);
    });

    it('flags limitReached on attempt to save a 6th video', () => {
      for (let i = 1; i <= 5; i++) {
        manager.toggleSaved(`video-${i}`);
      }

      const sixthResult = manager.toggleSaved('video-6');
      expect(sixthResult.saved).toBe(false);
      expect(sixthResult.limitReached).toBe(true);

      // Total saved remains capped at 5
      expect(manager.snapshot().savedIds).toHaveLength(5);
      expect(manager.isSaved('video-6')).toBe(false);
    });

    it('unsaves an already saved video when toggled again', () => {
      manager.toggleSaved('vid-toggle');
      expect(manager.isSaved('vid-toggle')).toBe(true);

      const unsaveResult = manager.toggleSaved('vid-toggle');
      expect(unsaveResult.saved).toBe(false);
      expect(unsaveResult.limitReached).toBe(false);
      expect(manager.isSaved('vid-toggle')).toBe(false);
    });

    it('records watch progress and clamps numbers safely', () => {
      manager.recordProgress('vid-progress-1', 45.8, false);
      const progress = manager.getProgress('vid-progress-1');
      expect(progress).toEqual({
        positionSeconds: 45,
        completed: false,
      });

      // Clamps negative positions
      manager.recordProgress('vid-negative', -10, false);
      expect(manager.getProgress('vid-negative')?.positionSeconds).toBe(0);
    });

    it('caps progress history at maximum 50 entries', () => {
      for (let i = 1; i <= 60; i++) {
        manager.recordProgress(`vid-${i}`, i * 2, false);
      }

      const snapshot = manager.snapshot();
      expect(snapshot.progress).toHaveLength(MAX_ANONYMOUS_PROGRESS);
      // Oldest entries discarded; newest entries retained
      expect(manager.getProgress('vid-60')).toBeTruthy();
      expect(manager.getProgress('vid-1')).toBeNull();
    });

    it('automatically prunes entries past 24-hour expiration on read/write', () => {
      manager.toggleSaved('vid-expire-soon');
      manager.recordProgress('vid-expire-soon', 50, false);
      expect(manager.isSaved('vid-expire-soon')).toBe(true);

      // Advance clock 25 hours
      simulatedTime += 25 * 60 * 60 * 1000;

      const snapshot = manager.snapshot();
      expect(snapshot.savedIds).toHaveLength(0);
      expect(snapshot.progress).toHaveLength(0);
      expect(manager.isSaved('vid-expire-soon')).toBe(false);
      expect(manager.getProgress('vid-expire-soon')).toBeNull();
    });

    it('builds sync payload and acknowledges sync per item', () => {
      manager.toggleSaved('save-1');
      manager.toggleSaved('save-2');
      manager.recordProgress('prog-1', 10, false);
      manager.recordProgress('prog-2', 20, true);

      const payload = manager.buildSyncPayload();
      expect(payload.savedVideoIds).toEqual(['save-1', 'save-2']);
      expect(payload.progress).toHaveLength(2);

      // Acknowledge save-1 and prog-1 only
      manager.acknowledgeSync({
        acknowledgedSavedIds: ['save-1'],
        acknowledgedProgressVideoIds: ['prog-1'],
      });

      const updatedSnapshot = manager.snapshot();
      expect(updatedSnapshot.savedIds).toEqual(['save-2']);
      expect(updatedSnapshot.progress.map((p) => p.videoId)).toEqual(['prog-2']);
    });
  });

  describe('UiSessionManager (sessionStorage)', () => {
    let uiManager: UiSessionManager;

    beforeEach(() => {
      uiManager = new UiSessionManager(mockStorage);
    });

    it('stores and retrieves non-sensitive UI tab and scroll state', () => {
      uiManager.update({
        activeTab: 'feed',
        feedIndex: 3,
        searchQuery: 'highlife',
        modalReason: 'save-limit',
      });

      const loaded = uiManager.load();
      expect(loaded).toEqual({
        activeTab: 'feed',
        feedIndex: 3,
        searchQuery: 'highlife',
        modalReason: 'save-limit',
      });
    });

    it('strictly prohibits passwords, tokens, cards, or personal credentials', () => {
      expect(() => {
        uiManager.update({ password: 'secret' } as Record<string, unknown>);
      }).toThrow(/Security Violation/);

      expect(() => {
        uiManager.update({ token: 'jwt-123' } as Record<string, unknown>);
      }).toThrow(/Security Violation/);

      expect(() => {
        uiManager.update({ cardNumber: '4111111111' } as Record<string, unknown>);
      }).toThrow(/Security Violation/);
    });

    it('clears UI session state', () => {
      uiManager.update({ activeTab: 'explore' });
      uiManager.clear();
      expect(uiManager.load()).toEqual({});
    });
  });

  describe('Settings 24-Hour TTL Expiry', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('preserves settings within 24 hours', () => {
      saveAppSettings({ dataSaver: true, autoplay: false, viewingInsights: true });
      expect(loadAppSettings()).toEqual({ dataSaver: true, autoplay: false, viewingInsights: true });
    });

    it('reverts to default settings when TTL expires', () => {
      // Save with 1ms TTL
      saveAppSettings({ dataSaver: true, autoplay: false, viewingInsights: true }, -10);
      expect(loadAppSettings()).toEqual(DEFAULT_SETTINGS);
    });
  });
});
