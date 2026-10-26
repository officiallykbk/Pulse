import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFollow } from '@/hooks/useFollow';
import { createViewingBudget, VIEWING_LIMIT_MINUTES, type ViewingBudgetTracker } from '@/lib/viewingBudget';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  follows: [] as Array<{ id: string; follower_id: string; following_id: string }>,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: state.user }, error: null })),
    },
    from: (table: string) => {
      void table;
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          const found = state.follows[0] ?? null;
          return { data: found, error: null };
        },
        delete: async () => {
          state.follows = [];
          return { error: null };
        },
        insert: async () => ({ error: null }),
      };
      return builder;
    },
  },
}));

describe('useFollow', () => {
  beforeEach(() => {
    state.user = null;
    state.follows = [];
    vi.clearAllMocks();
  });

  it('reports not-following when signed out', async () => {
    const { result } = renderHook(() => useFollow('creator-1'));
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.following).toBe(false);
  });

  it('toggles follow on for a signed-in user', async () => {
    state.user = { id: 'u1' };
    const { result } = renderHook(() => useFollow('creator-1'));
    await waitFor(() => expect(result.current.busy).toBe(false));
    await act(async () => {
      await result.current.toggleFollow();
    });
    expect(result.current.following).toBe(true);
  });

  it('reports an error when there is no creator', async () => {
    state.user = { id: 'u1' };
    const { result } = renderHook(() => useFollow(null));
    await waitFor(() => expect(result.current.busy).toBe(false));
    let result_: { error: string | null } = { error: null };
    await act(async () => {
      result_ = await result.current.toggleFollow();
    });
    expect(result_.error).toBeTruthy();
  });
});

describe('viewingBudget', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with the full daily budget', () => {
    const tracker: ViewingBudgetTracker = createViewingBudget('anonymous');
    const snap = tracker.snapshot();
    expect(snap.exhausted).toBe(false);
    expect(snap.nearLimit).toBe(false);
    expect(snap.remainingMs).toBe(VIEWING_LIMIT_MINUTES * 60 * 1000);
  });

  it('does not count time for signed-in tiers', () => {
    const tracker = createViewingBudget('free');
    tracker.start();
    tracker.stop();
    expect(tracker.snapshot().remainingMs).toBe(VIEWING_LIMIT_MINUTES * 60 * 1000);
  });

  it('reports exhaustion once budget is spent', () => {
    const tracker = createViewingBudget('anonymous');
    tracker.spend(VIEWING_LIMIT_MINUTES * 60 * 1000);
    const snap = tracker.snapshot();
    expect(snap.exhausted).toBe(true);
    expect(snap.remainingMs).toBe(0);
  });

  it('warns inside the final warning window', () => {
    const tracker = createViewingBudget('anonymous');
    tracker.spend((VIEWING_LIMIT_MINUTES - 5) * 60 * 1000);
    const snap = tracker.snapshot();
    expect(snap.nearLimit).toBe(true);
    expect(snap.exhausted).toBe(false);
  });
});
