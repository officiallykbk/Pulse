import { vi } from 'vitest';
import type { Video, Comment, Profile, UserTier } from '@/types';

export function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: crypto.randomUUID(),
    title: 'Test video',
    description: null,
    video_url: 'https://cdn.example.com/video.mp4',
    thumbnail_url: null,
    duration_seconds: 30,
    uploader_id: 'uploader-1',
    is_active: true,
    view_count: 0,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: crypto.randomUUID(),
    video_id: 'video-1',
    user_id: 'user-1',
    text: 'Test comment',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'user-1',
    tier: 'free' as UserTier,
    display_name: null,
    bio: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

type TableHandler = (args: {
  eq: Array<[string, unknown]>;
  select: string | undefined;
  method: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
  payload?: Record<string, unknown>;
  range?: [number, number];
}) => unknown;
export interface MockSupabaseChain {
  from: (table: string) => Record<string, unknown>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<QueryResult<unknown>>;
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
    onAuthStateChange: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
  };
  storage: {
    from: (bucket: string) => {
      upload: ReturnType<typeof vi.fn>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
  _tables: Map<string, TableHandler>;
}

export function createTableChain(handler: TableHandler): Record<string, unknown> {
  const state = {
    eq: [] as Array<[string, unknown]>,
    selectArg: undefined as string | undefined,
    method: 'select' as 'select' | 'insert' | 'update' | 'delete',
    payload: undefined as Record<string, unknown> | undefined,
  };

  const builder: Record<string, unknown> = {
    select: (arg?: string) => {
      state.selectArg = arg;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      state.eq.push([column, value]);
      return builder;
    },
    insert: (payload: Record<string, unknown>) => {
      state.method = 'insert';
      state.payload = Array.isArray(payload) ? payload[0] : payload;
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      state.method = 'update';
      state.payload = payload;
      return builder;
    },
    delete: () => {
      state.method = 'delete';
      return builder;
    },
    single: () => builder,
    maybeSingle: () => builder,
    order: () => builder,
    limit: () => builder,
    range: (from: number, to: number) => {
      (builder as { _range?: [number, number] })._range = [from, to];
      return builder;
    },
    or: () => builder,
    then: (
      resolve: (value: unknown) => void,
      reject: (reason?: unknown) => void
    ) => {
      try {
        const result = handler({
          eq: state.eq,
          select: state.selectArg,
          method: state.method,
          payload: state.payload,
          range: (builder as { _range?: [number, number] })._range,
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    },
  };

  return builder;
}

export function createMockSupabase(handlers: Record<string, TableHandler> = {}): MockSupabaseChain {
  const tables = new Map(Object.entries(handlers));

  return {
    from: (table: string) => {
      const handler = tables.get(table) ?? (() => ({ data: null, error: null }));
      return createTableChain(handler);
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ data: { path: 'test/path' }, error: null })),
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://storage.example.com/${path}` },
        }),
      }),
    },
    _tables: tables,
  };
}

export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
