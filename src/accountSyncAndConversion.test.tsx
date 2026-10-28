import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { onRequestPost as handleAnonymousSync } from '../functions/api/sync/anonymous';
import { accountSyncService } from './services/accountSync';
import { anonymousState } from './lib/anonymousState';
import { sessionService } from './services/session';
import { TrustConversionModal } from './components/TrustConversionModal';

describe('Phase 5: Anonymous-to-Account Synchronization & Conversion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    anonymousState.clearAll();
    accountSyncService.resetForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    accountSyncService.resetForTesting();
  });

  describe('Edge Endpoint: POST /api/sync/anonymous', () => {
    it('returns 401 when unauthenticated', async () => {
      const req = new Request('https://pulse.example/api/sync/anonymous', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pulse.example',
          Cookie: '__Host-pulse_csrf=csrf-val',
          'x-csrf-token': 'csrf-val',
        },
        body: JSON.stringify({ savedVideoIds: ['v-1'] }),
      });

      const res = await handleAnonymousSync({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-anon-key',
        },
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Authentication required');
    });

    it('returns 403 when CSRF token is invalid or missing', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const urlStr = typeof input === 'string' ? input : (input as Request).url;
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(JSON.stringify({ id: 'user-1', email: 'u1@pulse.video' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (urlStr.includes('/rest/v1/profiles')) {
          return new Response(JSON.stringify([{ tier: 'free' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.example/api/sync/anonymous', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pulse.example',
          Cookie: '__Host-pulse_access=valid-token',
        },
        body: JSON.stringify({ savedVideoIds: ['v-1'] }),
      });

      const res = await handleAnonymousSync({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-anon-key',
        },
      });

      expect(res.status).toBe(403);
    });

    it('upserts saved videos and merges watch progress with monotonic completion', async () => {
      const capturedFetches: Array<{ url: string; method?: string; body?: unknown }> = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const urlStr = typeof input === 'string' ? input : (input as Request).url;
        let body: unknown = null;
        if (init?.body) {
          try {
            body = JSON.parse(init.body as string);
          } catch {
            body = init.body;
          }
        }
        capturedFetches.push({ url: urlStr, method: init?.method, body });

        // Mock Supabase getUser
        if (urlStr.includes('/auth/v1/user')) {
          return new Response(
            JSON.stringify({ id: 'user-sync-1', email: 'sync@pulse.video' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Mock fetchUserTier profiles query
        if (urlStr.includes('/rest/v1/profiles')) {
          return new Response(JSON.stringify([{ tier: 'free' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Mock saved_videos insertion
        if (urlStr.includes('/rest/v1/saved_videos')) {
          return new Response(null, { status: 201 });
        }

        // Mock existing video_watch_progress lookup
        if (urlStr.includes('/rest/v1/video_watch_progress') && init?.method !== 'POST') {
          return new Response(
            JSON.stringify([
              {
                video_id: 'vid-existing',
                last_position_seconds: 60,
                completed: false,
                updated_at: '2026-10-28T18:00:00Z',
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // Mock video_watch_progress upsert
        if (urlStr.includes('/rest/v1/video_watch_progress') && init?.method === 'POST') {
          return new Response(null, { status: 201 });
        }

        return new Response('Not found', { status: 404 });
      });

      const req = new Request('https://pulse.example/api/sync/anonymous', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://pulse.example',
          Cookie: '__Host-pulse_access=valid-access; __Host-pulse_csrf=test-csrf',
          'x-csrf-token': 'test-csrf',
        },
        body: JSON.stringify({
          savedVideoIds: ['vid-1', 'vid-2'],
          progress: [
            {
              videoId: 'vid-existing',
              positionSeconds: 80,
              completed: true, // Monotonic completion
              updatedAt: '2026-10-28T18:30:00Z',
            },
            {
              videoId: 'vid-new',
              positionSeconds: 25,
              completed: false,
              updatedAt: '2026-10-28T18:30:00Z',
            },
          ],
        }),
      });

      const res = await handleAnonymousSync({
        request: req,
        env: {
          SUPABASE_URL: 'https://test.supabase.co',
          SUPABASE_ANON_KEY: 'test-anon-key',
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.acknowledgedSavedIds).toEqual(['vid-1', 'vid-2']);
      expect(data.acknowledgedProgressVideoIds).toEqual(['vid-existing', 'vid-new']);

      // Verify upserted progress includes monotonic true completion
      const progressPost = capturedFetches.find(
        (f) => f.url.includes('/rest/v1/video_watch_progress') && f.method === 'POST'
      );
      expect(progressPost).toBeTruthy();
      const rows = progressPost?.body as Array<{ video_id: string; completed: boolean }>;
      const existingRow = rows.find((r) => r.video_id === 'vid-existing');
      expect(existingRow?.completed).toBe(true);
    });
  });

  describe('Client AccountSyncService', () => {
    it('returns 0 synced when unauthenticated', async () => {
      vi.spyOn(sessionService, 'getSnapshot').mockReturnValue({
        user: null,
        tier: 'anonymous',
        loading: false,
        error: null,
      });

      const summary = await accountSyncService.syncAfterAuthentication();
      expect(summary).toEqual({ savedSynced: 0, progressSynced: 0 });
    });

    it('submits payload and removes only acknowledged items from local storage', async () => {
      // Setup authenticated user
      vi.spyOn(sessionService, 'getSnapshot').mockReturnValue({
        user: { id: 'u-1', email: 'test@pulse.video' },
        tier: 'free',
        loading: false,
        error: null,
      });
      vi.spyOn(sessionService, 'getCsrfToken').mockReturnValue('mock-csrf');

      // Populate local anonymous state
      anonymousState.toggleSaved('vid-ack-1');
      anonymousState.toggleSaved('vid-unack-2');
      anonymousState.recordProgress('vid-ack-1', 40, false);

      expect(anonymousState.snapshot().savedIds).toHaveLength(2);

      // Mock /api/sync/anonymous acknowledging only vid-ack-1
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (input, init) => {
        expect(input).toBe('/api/sync/anonymous');
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-csrf-token']).toBe('mock-csrf');

        return new Response(
          JSON.stringify({
            acknowledgedSavedIds: ['vid-ack-1'],
            acknowledgedProgressVideoIds: ['vid-ack-1'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const summary = await accountSyncService.syncAfterAuthentication();
      expect(summary).toEqual({ savedSynced: 1, progressSynced: 1 });

      // vid-ack-1 removed from local state, vid-unack-2 retained
      const snapshot = anonymousState.snapshot();
      expect(snapshot.savedIds).toEqual(['vid-unack-2']);
      expect(snapshot.progress).toHaveLength(0);
    });
  });

  describe('TrustConversionModal Component', () => {
    it('renders save-limit modal with clear retention and device-sync explanation', () => {
      const onContinue = vi.fn();
      const onClose = vi.fn();

      render(
        <TrustConversionModal
          open={true}
          intent="save-limit"
          onClose={onClose}
          onContinueToAuth={onContinue}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Device Limit Reached')).toBeInTheDocument();
      expect(screen.getByText('Keep your saved videos permanently')).toBeInTheDocument();
      expect(screen.getByText(/You have saved 5 videos on this device/)).toBeInTheDocument();
      expect(screen.getByText('Sign Up to Save Permanently')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Sign Up to Save Permanently'));
      expect(onContinue).toHaveBeenCalledWith('save-limit');
      expect(onClose).toHaveBeenCalled();
    });

    it('renders 24-hour expiry explanation for ttl-expired intent', () => {
      render(
        <TrustConversionModal
          open={true}
          intent="ttl-expired"
          onClose={vi.fn()}
          onContinueToAuth={vi.fn()}
        />
      );

      expect(screen.getByText('24-Hour Expiry')).toBeInTheDocument();
      expect(screen.getByText('Never lose your favorite videos')).toBeInTheDocument();
      expect(screen.getByText(/expire after 24 hours on this device/)).toBeInTheDocument();
    });

    it('renders creator benefits for upload intent', () => {
      render(
        <TrustConversionModal
          open={true}
          intent="upload"
          onClose={vi.fn()}
          onContinueToAuth={vi.fn()}
        />
      );

      expect(screen.getByText('Creator Account')).toBeInTheDocument();
      expect(screen.getByText('Share your videos with the community')).toBeInTheDocument();
    });
  });
});
