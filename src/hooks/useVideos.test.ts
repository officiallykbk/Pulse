import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVideos } from '@/hooks/useVideos';
import { useUserVideos } from '@/hooks/useUserVideos';
import { makeVideo } from '@/test/helpers';
import type { Video } from '@/types';

type QueryCtx = {
  method: string;
  eq: Array<[string, unknown]>;
  range?: [number, number];
};

type TableHandler = (args: QueryCtx) => unknown;

const state = vi.hoisted(() => ({
  handlers: {} as Record<string, (args: { method: string; eq: Array<[string, unknown]>; range?: [number, number] }) => unknown>,
}));

vi.mock('@/services/supabase', () => {
  const makeBuilder = (table: string) => {
    const ctx = {
      method: 'select',
      eq: [] as Array<[string, unknown]>,
      range: undefined as [number, number] | undefined,
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        ctx.eq.push([col, val]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      in: () => builder,
      range: (from: number, to: number) => {
        ctx.range = [from, to];
        return builder;
      },
      delete: () => {
        ctx.method = 'delete';
        return builder;
      },
      insert: () => {
        ctx.method = 'insert';
        return builder;
      },
      update: () => {
        ctx.method = 'update';
        return builder;
      },
      single: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (v: unknown) => void) => {
        const handler = state.handlers[table];
        resolve(handler ? handler(ctx) : { data: null, error: null });
      },
    };
    return builder;
  };

  return {
    supabase: {
      from: (table: string) => makeBuilder(table),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
        getSession: vi.fn(async () => ({ data: { session: { access_token: 't' } }, error: null })),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      storage: {
        from: () => ({
          upload: vi.fn(async () => ({ data: { path: 'p' }, error: null })),
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://s/${path}` } }),
        }),
      },
    },
  };
});

const supabaseMock = (await import('@/services/supabase')).supabase as unknown as {
  from: (table: string) => unknown;
  rpc: ReturnType<typeof vi.fn>;
};

function setHandlers(handlers: Record<string, TableHandler>) {
  state.handlers = handlers as typeof state.handlers;
}

const PAGE = 10;
function pageOfVideos(count: number, startIndex = 0): Video[] {
  return Array.from({ length: count }, (_, i) => makeVideo({ id: `v-${startIndex + i}` }));
}

describe('useVideos (feed pagination)', () => {
  beforeEach(() => {
    setHandlers({});
  });

  it('loads the first page and exposes it', async () => {
    setHandlers({
      videos: () => ({ data: pageOfVideos(PAGE), error: null }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });
    expect(result.current.videos).toHaveLength(PAGE);
    expect(result.current.initialLoading).toBe(false);
    expect(result.current.hasMore).toBe(true);
  });

  it('appends the next page without duplicating (offset advances)', async () => {
    setHandlers({
      videos: (ctx) => ({
        data: pageOfVideos(PAGE, ctx.range?.[0] ?? 0),
        error: null,
      }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });
    await act(async () => {
      await result.current.loadVideos(false);
    });
    expect(result.current.videos).toHaveLength(PAGE * 2);
    const ids = new Set(result.current.videos.map((v) => v.id));
    expect(ids.size).toBe(PAGE * 2);
  });

  it('marks the feed exhausted when a page returns fewer than PAGE_SIZE rows', async () => {
    setHandlers({
      videos: (ctx) => ({
        data: pageOfVideos(3, ctx.range?.[0] ?? 0),
        error: null,
      }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });
    expect(result.current.hasMore).toBe(false);
  });

  it('marks the feed empty when the API returns no rows', async () => {
    setHandlers({
      videos: () => ({ data: [], error: null }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });
    expect(result.current.videos).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
  });

  it('exposes the error message when the query fails', async () => {
    setHandlers({
      videos: () => ({ data: null, error: { message: 'connection refused' } }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });
    expect(result.current.error).toBe('connection refused');
  });
});

describe('useUserVideos (profile content)', () => {
  beforeEach(() => {
    setHandlers({});
  });

  it('returns empty lists for signed-out users', async () => {
    const { result } = renderHook(() => useUserVideos(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.uploaded).toEqual([]);
    expect(result.current.liked).toEqual([]);
  });

  it('fetches uploaded and liked videos for a signed-in user', async () => {
    const uploaded = pageOfVideos(2);
    setHandlers({
      videos: (ctx) => {
        if (ctx.eq.some(([col]) => col === 'uploader_id')) {
          return { data: uploaded, error: null };
        }
        return { data: pageOfVideos(1), error: null };
      },
      likes: () => ({ data: [{ video_id: 'v-0' }], error: null }),
    });
    const { result } = renderHook(() => useUserVideos('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.uploaded).toHaveLength(2);
    expect(result.current.liked.length).toBeGreaterThanOrEqual(1);
  });

  it('orders liked videos by most-recently-liked', async () => {
    setHandlers({
      videos: () => ({
        data: [makeVideo({ id: 'a' }), makeVideo({ id: 'b' })],
        error: null,
      }),
      likes: () => ({
        data: [{ video_id: 'b' }, { video_id: 'a' }],
        error: null,
      }),
    });
    const { result } = renderHook(() => useUserVideos('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.liked.map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('useVideos (injected & direct video)', () => {
  beforeEach(() => {
    setHandlers({});
  });

  it('injects a video into the feed without duplicates', async () => {
    setHandlers({
      videos: () => ({ data: pageOfVideos(2), error: null }),
    });
    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideos(true);
    });

    const newVideo = makeVideo({ id: 'injected-1', title: 'Injected video' });
    act(() => {
      result.current.injectVideo(newVideo);
    });
    expect(result.current.videos[0].id).toBe('injected-1');
    expect(result.current.videos).toHaveLength(3);

    // Re-injecting does not duplicate
    act(() => {
      result.current.injectVideo(newVideo);
    });
    expect(result.current.videos).toHaveLength(3);
  });

  it('loads video by id and enriches uploader profile', async () => {
    setHandlers({
      videos: (ctx) => {
        if (ctx.eq.some(([col, val]) => col === 'id' && val === 'target-1')) {
          return {
            data: makeVideo({ id: 'target-1', uploader_id: 'user-xyz' }),
            error: null,
          };
        }
        return { data: [], error: null };
      },
      profiles: () => ({
        data: { id: 'user-xyz', display_name: 'Kofi Mensah', avatar_url: 'https://avatar.test/kofi.jpg' },
        error: null,
      }),
    });

    const { result } = renderHook(() => useVideos());
    await act(async () => {
      await result.current.loadVideoById('target-1');
    });

    expect(result.current.videos).toHaveLength(1);
    expect(result.current.videos[0].id).toBe('target-1');
    expect(result.current.videos[0].uploader?.display_name).toBe('Kofi Mensah');
  });
});

// keep the mock reference alive for lint
void supabaseMock;
