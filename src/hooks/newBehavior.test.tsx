import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFollow } from '@/hooks/useFollow';
import { DailyActivityManager } from '@/lib/dailyActivity';

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

describe('dailyActivity', () => {
  let simulatedTime: number;
  let activity: DailyActivityManager;

  beforeEach(() => {
    localStorage.clear();
    simulatedTime = new Date('2026-10-28T12:00:00Z').getTime();
    activity = new DailyActivityManager(() => simulatedTime);
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
  });

  it('marks activity when foreground playback begins', () => {
    const recorded = activity.markActive();
    expect(recorded).toBe(true);

    const snap = activity.snapshot();
    expect(snap.activeToday).toBe(true);
    expect(snap.lastActiveDate).toBe('2026-10-28');
  });

  it('records at most once per calendar day (no duplicate writes)', () => {
    expect(activity.markActive()).toBe(true);
    // Same day subsequent call is a no-op
    expect(activity.markActive()).toBe(false);
  });

  it('suppresses recording when document is in background', () => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });

    const recorded = activity.markActive();
    expect(recorded).toBe(false);

    const snap = activity.snapshot();
    expect(snap.activeToday).toBe(false);
  });

  it('records anew when advancing to next calendar day', () => {
    activity.markActive();

    // Advance 24 hours to next day
    simulatedTime += 24 * 60 * 60 * 1000;
    const snapBefore = activity.snapshot();
    expect(snapBefore.activeToday).toBe(false);

    expect(activity.markActive()).toBe(true);
    const snapAfter = activity.snapshot();
    expect(snapAfter.activeToday).toBe(true);
    expect(snapAfter.lastActiveDate).toBe('2026-10-29');
  });
});
