/**
 * Account Synchronization Service for Pulse.
 *
 * Implements the AccountSyncModule interface:
 * - Synchronizes anonymous saves and progress to the user's permanent account upon authentication.
 * - Deletes only acknowledged items from local storage.
 * - Idempotent, safe across retries and offline reconnects.
 * - Hooks into session transitions (sign-in, confirmed sign-up, authenticated bootstrap).
 */

import { anonymousState, type AnonymousSyncResult } from '@/lib/anonymousState';
import { sessionService } from './session';

export interface SyncSummary {
  savedSynced: number;
  progressSynced: number;
}

export interface AccountSyncModule {
  syncAfterAuthentication(): Promise<SyncSummary>;
}

export class AccountSyncService implements AccountSyncModule {
  private syncInProgress: Promise<SyncSummary> | null = null;
  private initialized = false;
  private previousUserId: string | null = null;

  constructor() {
    this.setupAutoSync();
  }

  /**
   * Sets up automated synchronization when an anonymous session becomes authenticated.
   */
  private setupAutoSync(): void {
    if (this.initialized) return;
    this.initialized = true;

    sessionService.subscribe(() => {
      const current = sessionService.getSnapshot();
      const currentUserId = current.user?.id ?? null;

      // Trigger sync on transition from anonymous to authenticated user with pending items
      if (!this.previousUserId && currentUserId) {
        const payload = anonymousState.buildSyncPayload();
        if (payload.savedVideoIds.length > 0 || payload.progress.length > 0) {
          void this.syncAfterAuthentication();
        }
      }

      this.previousUserId = currentUserId;
    });
  }

  /**
   * Synchronizes local anonymous state to the authenticated account.
   */
  async syncAfterAuthentication(): Promise<SyncSummary> {
    if (this.syncInProgress) {
      return this.syncInProgress;
    }

    const session = sessionService.getSnapshot();
    if (!session.user) {
      return { savedSynced: 0, progressSynced: 0 };
    }

    const payload = anonymousState.buildSyncPayload();
    if (payload.savedVideoIds.length === 0 && payload.progress.length === 0) {
      return { savedSynced: 0, progressSynced: 0 };
    }

    const csrfToken = sessionService.getCsrfToken();

    const task = (async (): Promise<SyncSummary> => {
      try {
        const res = await fetch('/api/sync/anonymous', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          return { savedSynced: 0, progressSynced: 0 };
        }

        const data = (await res.json()) as AnonymousSyncResult;
        const ackSaved = data.acknowledgedSavedIds || [];
        const ackProgress = data.acknowledgedProgressVideoIds || [];

        // Delete only server-acknowledged items
        anonymousState.acknowledgeSync({
          acknowledgedSavedIds: ackSaved,
          acknowledgedProgressVideoIds: ackProgress,
        });

        return {
          savedSynced: ackSaved.length,
          progressSynced: ackProgress.length,
        };
      } catch (err) {
        console.error('Account synchronization failed:', err);
        return { savedSynced: 0, progressSynced: 0 };
      }
    })();

    this.syncInProgress = task;
    try {
      return await task;
    } finally {
      this.syncInProgress = null;
    }
  }

  /**
   * Reset helper for testing environments.
   */
  resetForTesting(): void {
    this.syncInProgress = null;
    this.previousUserId = null;
  }
}

export const accountSyncService = new AccountSyncService();
