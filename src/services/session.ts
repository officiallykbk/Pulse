/**
 * Client Session Module for Pulse.
 * Owns session lifecycle, snapshot state, subscriptions, and same-origin cookie auth.
 * Never stores or returns token material in JavaScript.
 */

export interface SessionUser {
  id: string;
  email: string;
}

export interface SessionSnapshot {
  user: SessionUser | null;
  tier: 'pro' | 'free' | 'anonymous';
  loading: boolean;
  error: string | null;
}

export interface AuthResult {
  error: string | null;
  user?: SessionUser | null;
}

export interface SessionModule {
  bootstrap(): Promise<SessionSnapshot>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  getCsrfToken(): string | null;
}

function extractProjectRef(supabaseUrl?: string): string | null {
  if (!supabaseUrl) return null;
  try {
    const url = new URL(supabaseUrl);
    const hostParts = url.hostname.split('.');
    return hostParts[0] || null;
  } catch {
    return null;
  }
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)(?:__Host-pulse_csrf|pulse_csrf)=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

class ProductionSessionService implements SessionModule {
  private snapshot: SessionSnapshot = {
    user: null,
    tier: 'anonymous',
    loading: true,
    error: null,
  };

  private csrfToken: string | null = null;
  private listeners = new Set<() => void>();
  private bootstrapped = false;
  private bootstrapPromise: Promise<SessionSnapshot> | null = null;

  constructor() {
    this.csrfToken = readCsrfCookie();
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  getCsrfToken(): string | null {
    return this.csrfToken || readCsrfCookie();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('Session listener error:', err);
      }
    }
  }

  private updateSnapshot(partial: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.notify();
  }

  /**
   * One-time legacy session migration.
   * Checks strictly the exact Supabase auth key for this project,
   * sends it to /api/auth/adopt, and removes it only on success.
   */
  private async migrateLegacySession(): Promise<boolean> {
    if (typeof window === 'undefined' || !window.localStorage) return false;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const ref = extractProjectRef(supabaseUrl);
    if (!ref) return false;

    const legacyKey = `sb-${ref}-auth-token`;
    const raw = window.localStorage.getItem(legacyKey);
    if (!raw) return false;

    try {
      const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
      if (!parsed.access_token || !parsed.refresh_token) {
        window.localStorage.removeItem(legacyKey);
        return false;
      }

      const res = await fetch('/api/auth/adopt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
          user: SessionUser;
          tier: 'pro' | 'free';
          csrfToken?: string;
        };
        if (data.csrfToken) {
          this.csrfToken = data.csrfToken;
        }
        // Migration succeeded: delete legacy key
        window.localStorage.removeItem(legacyKey);
        this.updateSnapshot({
          user: data.user,
          tier: data.tier,
          loading: false,
          error: null,
        });
        return true;
      } else {
        // Expired or invalid: remove stale legacy key
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Offline or network error: retain key for retry on next boot
    }
    return false;
  }

  async bootstrap(): Promise<SessionSnapshot> {
    if (this.bootstrapped) {
      return this.snapshot;
    }
    if (this.bootstrapPromise) {
      return this.bootstrapPromise;
    }

    this.bootstrapPromise = (async () => {
      this.updateSnapshot({ loading: true, error: null });

      try {
        // 1. Check for cookie-based session first
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (res.ok) {
          const data = await res.json() as {
            user: SessionUser | null;
            tier: 'pro' | 'free' | 'anonymous';
            csrfToken?: string | null;
          };

          if (data.csrfToken) {
            this.csrfToken = data.csrfToken;
          }

          if (data.user) {
            this.updateSnapshot({
              user: data.user,
              tier: data.tier,
              loading: false,
              error: null,
            });
            this.bootstrapped = true;
            return this.snapshot;
          }
        }

        // 2. If no active cookie session, attempt one-time adoption of legacy localStorage session
        const adopted = await this.migrateLegacySession();
        if (adopted) {
          this.bootstrapped = true;
          return this.snapshot;
        }

        // 3. Anonymous state confirmed
        this.updateSnapshot({
          user: null,
          tier: 'anonymous',
          loading: false,
          error: null,
        });
      } catch (err) {
        this.updateSnapshot({
          user: null,
          tier: 'anonymous',
          loading: false,
          error: (err as Error).message || 'Failed to initialize session',
        });
      } finally {
        this.bootstrapped = true;
        this.bootstrapPromise = null;
      }

      return this.snapshot;
    })();

    return this.bootstrapPromise;
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    this.updateSnapshot({ loading: true, error: null });

    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as {
        user?: SessionUser;
        tier?: 'pro' | 'free';
        csrfToken?: string;
        error?: string;
      };

      if (!res.ok || data.error) {
        const errorMsg = data.error || 'Failed to sign in';
        this.updateSnapshot({ loading: false, error: errorMsg });
        return { error: errorMsg };
      }

      if (data.csrfToken) {
        this.csrfToken = data.csrfToken;
      }

      const user = data.user || null;
      const tier = data.tier || 'free';

      this.updateSnapshot({
        user,
        tier,
        loading: false,
        error: null,
      });

      return { error: null, user };
    } catch (err) {
      const errorMsg = (err as Error).message || 'Network error during sign in';
      this.updateSnapshot({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }

  async signUp(email: string, password: string): Promise<AuthResult> {
    this.updateSnapshot({ loading: true, error: null });

    try {
      const res = await fetch('/api/auth/sign-up', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as {
        user?: SessionUser;
        tier?: 'pro' | 'free' | 'anonymous';
        csrfToken?: string;
        error?: string;
        message?: string;
      };

      if (!res.ok || data.error) {
        const errorMsg = data.error || 'Failed to sign up';
        this.updateSnapshot({ loading: false, error: errorMsg });
        return { error: errorMsg };
      }

      if (data.csrfToken) {
        this.csrfToken = data.csrfToken;
      }

      const user = data.user || null;
      const tier = data.tier || 'anonymous';

      this.updateSnapshot({
        user,
        tier,
        loading: false,
        error: null,
      });

      return { error: null, user };
    } catch (err) {
      const errorMsg = (err as Error).message || 'Network error during sign up';
      this.updateSnapshot({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }

  async signOut(): Promise<void> {
    this.updateSnapshot({ loading: true });

    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}),
        },
      });
    } catch {
      // Best-effort sign-out
    } finally {
      this.csrfToken = null;
      this.updateSnapshot({
        user: null,
        tier: 'anonymous',
        loading: false,
        error: null,
      });
    }
  }
}

// In-memory test session adapter for deterministic unit tests
export class InMemorySessionService implements SessionModule {
  private snapshot: SessionSnapshot;
  private listeners = new Set<() => void>();
  private testCsrf = 'test-csrf-token-12345';

  constructor(initial: Partial<SessionSnapshot> = {}) {
    this.snapshot = {
      user: null,
      tier: 'anonymous',
      loading: false,
      error: null,
      ...initial,
    };
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  getCsrfToken(): string | null {
    return this.testCsrf;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const l of this.listeners) l();
  }

  async bootstrap(): Promise<SessionSnapshot> {
    return this.snapshot;
  }

  async signIn(email: string): Promise<AuthResult> {
    this.snapshot = {
      user: { id: 'mock-user-id', email },
      tier: 'free',
      loading: false,
      error: null,
    };
    this.notify();
    return { error: null, user: this.snapshot.user };
  }

  async signUp(email: string): Promise<AuthResult> {
    this.snapshot = {
      user: { id: 'mock-user-id', email },
      tier: 'free',
      loading: false,
      error: null,
    };
    this.notify();
    return { error: null, user: this.snapshot.user };
  }

  async signOut(): Promise<void> {
    this.snapshot = {
      user: null,
      tier: 'anonymous',
      loading: false,
      error: null,
    };
    this.notify();
  }
}

export const sessionService: SessionModule = new ProductionSessionService();
