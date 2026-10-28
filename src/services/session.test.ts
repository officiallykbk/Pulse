import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sessionService, InMemorySessionService } from './session';

describe('Phase 1: Client SessionModule', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('InMemorySessionService provides a deterministic mock interface for testing', async () => {
    const mem = new InMemorySessionService({ tier: 'anonymous' });
    expect(mem.getSnapshot().tier).toBe('anonymous');
    expect(mem.getSnapshot().user).toBeNull();

    let notified = false;
    const unsub = mem.subscribe(() => {
      notified = true;
    });

    await mem.signIn('tester@pulse.video');
    expect(notified).toBe(true);
    expect(mem.getSnapshot().user?.email).toBe('tester@pulse.video');
    expect(mem.getSnapshot().tier).toBe('free');

    await mem.signOut();
    expect(mem.getSnapshot().user).toBeNull();
    expect(mem.getSnapshot().tier).toBe('anonymous');

    unsub();
  });

  it('bootstrap fetches session from same-origin endpoint without accessing Web Storage tokens', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/session')) {
        return new Response(
          JSON.stringify({
            user: { id: 'u-123', email: 'session@test.com' },
            tier: 'pro',
            csrfToken: 'csrf-123',
          }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const snapshot = await sessionService.bootstrap();
    expect(snapshot.user?.email).toBe('session@test.com');
    expect(snapshot.tier).toBe('pro');
    expect(sessionService.getCsrfToken()).toBe('csrf-123');

    // Confirm NO token was written to localStorage
    expect(localStorage.getItem('sb-token')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('signs in through same-origin HTTPS endpoint and updates reactive state', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/auth/sign-in')) {
        return new Response(
          JSON.stringify({
            user: { id: 'u-signin-1', email: 'hello@pulse.video' },
            tier: 'free',
            csrfToken: 'csrf-signin-999',
          }),
          { status: 200 }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    let updates = 0;
    const unsub = sessionService.subscribe(() => {
      updates++;
    });

    const result = await sessionService.signIn('hello@pulse.video', 'secretPass');
    expect(result.error).toBeNull();
    expect(result.user?.id).toBe('u-signin-1');
    expect(sessionService.getSnapshot().user?.id).toBe('u-signin-1');
    expect(sessionService.getCsrfToken()).toBe('csrf-signin-999');
    expect(updates).toBeGreaterThan(0);

    unsub();
  });

  it('signs out and clears user state without token leakage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    );

    await sessionService.signOut();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/auth/sign-out',
      expect.objectContaining({ method: 'POST' })
    );

    expect(sessionService.getSnapshot().user).toBeNull();
    expect(sessionService.getSnapshot().tier).toBe('anonymous');
    expect(sessionService.getCsrfToken()).toBeNull();
  });
});
