/**
 * TTL Storage Utility for Pulse.
 *
 * Implements 24-hour TTL envelopes with automatic pruning on read/write,
 * injected clock support for deterministic testing, and graceful storage failure handling.
 */

import { safeLocalStorage } from '@/lib/safeStorage';

export const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TtlStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TtlEnvelope<T> {
  value: T;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

function getBrowserStorage(): TtlStorageAdapter {
  return safeLocalStorage;
}

/**
 * Reads a TTL-wrapped item from storage. Automatically prunes if expired.
 */
export function getTtlItem<T>(
  key: string,
  adapter?: TtlStorageAdapter | null,
  nowFn: () => number = () => Date.now()
): T | null {
  const storage = adapter !== undefined ? adapter : getBrowserStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TtlEnvelope<T>>;
    const now = nowFn();

    // Check if valid envelope with expiresAt
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.expiresAt === 'number') {
      if (now >= parsed.expiresAt) {
        // Expired -> prune immediately
        storage.removeItem(key);
        return null;
      }
      return (parsed.value as T) ?? null;
    }

    // Un-enveloped legacy value
    return parsed as unknown as T;
  } catch {
    // Storage read or JSON parse failure -> drop corrupt entry
    try {
      storage.removeItem(key);
    } catch {
      // Ignore
    }
    return null;
  }
}

/**
 * Writes an item wrapped in a 24-hour TTL envelope.
 */
export function setTtlItem<T>(
  key: string,
  value: T,
  ttlMs: number = DEFAULT_TTL_MS,
  adapter?: TtlStorageAdapter | null,
  nowFn: () => number = () => Date.now()
): boolean {
  const storage = adapter !== undefined ? adapter : getBrowserStorage();
  if (!storage) return false;

  const now = nowFn();
  const envelope: TtlEnvelope<T> = {
    value,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
  };

  try {
    storage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    // QuotaExceededError or security exception -> fail gracefully
    return false;
  }
}

/**
 * Removes an item from storage safely.
 */
export function removeTtlItem(
  key: string,
  adapter?: TtlStorageAdapter | null
): void {
  const storage = adapter !== undefined ? adapter : getBrowserStorage();
  if (!storage) return;

  try {
    storage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Cleans up untimestamped legacy guest history and resume positions.
 */
export function pruneLegacyKeys(adapter?: TtlStorageAdapter | null): void {
  const storage = adapter !== undefined ? adapter : getBrowserStorage();
  if (!storage) return;

  try {
    // Collect keys to delete
    const keysToRemove: string[] = [];
    if (typeof (storage as Storage).length === 'number') {
      const s = storage as Storage;
      for (let i = 0; i < s.length; i++) {
        const key = s.key(i);
        if (key && (key.startsWith('pulse:resume-position:') || key === 'pulse_anonymous_viewing')) {
          keysToRemove.push(key);
        }
      }
    }

    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}
