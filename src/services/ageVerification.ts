/**
 * Age Verification Service for Pulse.
 *
 * Implements the AgeVerificationModule interface:
 * - status(): Promise<'verified' | 'unverified'>
 * - declareAdult(): Promise<'verified'>
 *
 * Security & Privacy Guarantees:
 * - Opaque tokens remain in HttpOnly cookies; client JS cannot read or tamper with them.
 * - Zero PII is requested, transferred, or stored.
 * - Reactive subscription model for UI updates.
 */

export type AgeVerificationStatus = 'verified' | 'unverified';
export type AgeVerificationSnapshot = AgeVerificationStatus | 'unknown';

export interface AgeVerificationModule {
  status(): Promise<AgeVerificationStatus>;
  declareAdult(): Promise<'verified'>;
  getSnapshot(): AgeVerificationSnapshot;
  subscribe(listener: () => void): () => void;
}

class AgeVerificationService implements AgeVerificationModule {
  private currentStatus: AgeVerificationSnapshot = 'unknown';
  private inFlightPromise: Promise<AgeVerificationStatus> | null = null;
  private listeners = new Set<() => void>();

  getSnapshot(): AgeVerificationSnapshot {
    return this.currentStatus;
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
        console.error('AgeVerificationService listener error:', err);
      }
    }
  }

  /**
   * Fetches the current verification status from the first-party server endpoint.
   */
  async status(): Promise<AgeVerificationStatus> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        const res = await fetch('/api/age/status', {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
          },
        });

        if (!res.ok) {
          this.currentStatus = 'unverified';
          this.notify();
          return 'unverified';
        }

        const data = (await res.json()) as { verified?: boolean };
        const newStatus: AgeVerificationStatus = data.verified === true ? 'verified' : 'unverified';

        if (this.currentStatus !== newStatus) {
          this.currentStatus = newStatus;
          this.notify();
        }

        return newStatus;
      } catch {
        this.currentStatus = 'unverified';
        this.notify();
        return 'unverified';
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  /**
   * Submits self-declaration affirmative action without any PII.
   */
  async declareAdult(): Promise<'verified'> {
    const res = await fetch('/api/age/verify', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ declaredOver18: true }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      const errMsg = (errData as { error?: string })?.error || 'Age declaration failed';
      throw new Error(errMsg);
    }

    const data = (await res.json()) as { verified?: boolean };
    if (data.verified !== true) {
      throw new Error('Age declaration was not confirmed by the server');
    }

    this.currentStatus = 'verified';
    this.notify();
    return 'verified';
  }

  /**
   * Reset helper for testing environments
   */
  resetForTesting(): void {
    this.currentStatus = 'unknown';
    this.inFlightPromise = null;
    this.listeners.clear();
  }
}

export const ageVerificationService = new AgeVerificationService();
