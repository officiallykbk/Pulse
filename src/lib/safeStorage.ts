/**
 * Universal Storage Shield for Pulse.
 *
 * Implements a fail-safe, exception-shielded abstraction over `localStorage` and `sessionStorage`.
 *
 * Browsers and privacy extensions (e.g., Safari Private Browsing, Brave Shields, Firefox Strict Mode,
 * embedded iframe storage partitioning) throw `DOMException` or `SecurityError` whenever storage
 * is blocked or quota is exhausted.
 *
 * This module:
 * 1. Safely probes native storage availability without unhandled errors.
 * 2. Shields all `.getItem()`, `.setItem()`, `.removeItem()`, `.clear()` invocations.
 * 3. Gracefully and transparently falls back to an in-memory dictionary when native storage is restricted.
 * 4. Ensures the application and root React render tree NEVER crash due to storage access errors.
 */

export interface SafeStorageInterface {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
  isNativeAvailable(): boolean;
}

export class SafeStorageAdapter implements SafeStorageInterface {
  private memoryFallback = new Map<string, string>();
  private storageType: 'localStorage' | 'sessionStorage';

  constructor(type: 'localStorage' | 'sessionStorage') {
    this.storageType = type;
  }

  private getNativeStorage(): Storage | null {
    try {
      if (typeof window === 'undefined') return null;
      const storage = window[this.storageType];
      if (!storage) return null;
      // Probe to verify that reading and writing is actually permitted
      const testKey = `__pulse_probe_${Math.random().toString(36).substring(7)}__`;
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return storage;
    } catch {
      return null;
    }
  }

  isNativeAvailable(): boolean {
    return this.getNativeStorage() !== null;
  }

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined') {
        const storage = window[this.storageType];
        if (storage) {
          const nativeVal = storage.getItem(key);
          if (nativeVal !== null) {
            return nativeVal;
          }
        }
      }
    } catch {
      // Access blocked or restricted
    }
    return this.memoryFallback.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined') {
        const storage = window[this.storageType];
        if (storage) {
          storage.setItem(key, value);
          // Persisted natively; ensure stale fallback copy is cleared
          this.memoryFallback.delete(key);
          return;
        }
      }
    } catch {
      // Storage quota exceeded or blocked -> fall back to in-memory store
    }
    this.memoryFallback.set(key, value);
  }

  removeItem(key: string): void {
    this.memoryFallback.delete(key);
    try {
      if (typeof window !== 'undefined') {
        const storage = window[this.storageType];
        if (storage) {
          storage.removeItem(key);
        }
      }
    } catch {
      // Ignore
    }
  }

  clear(): void {
    this.memoryFallback.clear();
    try {
      if (typeof window !== 'undefined') {
        const storage = window[this.storageType];
        if (storage) {
          storage.clear();
        }
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Reset in-memory storage for deterministic unit testing.
   */
  _resetMemoryForTesting(): void {
    this.memoryFallback.clear();
  }
}

export const safeLocalStorage = new SafeStorageAdapter('localStorage');
export const safeSessionStorage = new SafeStorageAdapter('sessionStorage');

/**
 * Convenience helper to safely read parsed JSON with typed fallback.
 */
export function safeGetJson<T>(storage: SafeStorageInterface, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return (JSON.parse(raw) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Convenience helper to safely persist JSON values.
 */
export function safeSetJson<T>(storage: SafeStorageInterface, key: string, value: T): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
