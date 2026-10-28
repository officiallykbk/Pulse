import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSavedVideos } from '@/hooks/useSavedVideos';

const state = vi.hoisted(() => ({ savedRows: [] as Array<{ video_id: string; created_at: string }>, videos: [] as Array<Record<string, unknown>> }));

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => {
          chain.then = (resolve: (value: unknown) => void) => resolve({ data: state.savedRows, error: null });
          return chain;
        },
        in: () => chain,
        then: (resolve: (value: unknown) => void) => resolve({ data: state.savedRows, error: null }),
      };
      if (table === 'videos') {
        chain.eq = () => {
          chain.then = (resolve: (value: unknown) => void) => resolve({ data: state.videos, error: null });
          return chain;
        };
      }
      return chain;
    },
  },
}));

describe('useSavedVideos', () => {
  beforeEach(() => {
    state.savedRows = [];
    state.videos = [];
  });

  it('does not query without a signed-in user', () => {
    const { result } = renderHook(() => useSavedVideos(null));
    expect(result.current.savedVideos).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('returns saved videos in the user saved order', async () => {
    state.savedRows = [
      { video_id: 'two', created_at: '2026-01-02' },
      { video_id: 'one', created_at: '2026-01-01' },
    ];
    state.videos = [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }];
    const { result } = renderHook(() => useSavedVideos('user-1'));
    await waitFor(() => expect(result.current.savedVideos).toHaveLength(2));
    expect(result.current.savedVideos.map((video) => video.id)).toEqual(['two', 'one']);
  });
});
