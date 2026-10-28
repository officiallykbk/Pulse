import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLikes } from '@/hooks/useLikes';
import { useFollow } from '@/hooks/useFollow';
import { validateVideoFile, validateVideoDuration } from '@/services/videoUpload';

// Mock supabase service
const state = vi.hoisted(() => ({
  currentUser: null as { id: string; email?: string } | null,
  likesTable: new Map<string, { id: string; video_id: string; user_id: string }>(),
  followsTable: new Map<string, { id: string; follower_id: string; following_id: string }>(),
  commentsTable: [] as Array<{ id: string; video_id: string; user_id: string; text: string }>,
  usersTable: new Map<string, { id: string; display_name: string; bio: string }>(),
}));

vi.mock('@/services/supabase', () => {
  const makeBuilder = (table: string) => {
    let currentFilters: Record<string, unknown> = {};

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (col: string, val: unknown) => {
        currentFilters[col] = val;
        return builder;
      },
      maybeSingle: async () => {
        if (table === 'likes') {
          const key = `${currentFilters['video_id']}:${currentFilters['user_id']}`;
          const item = state.likesTable.get(key);
          return { data: item || null, error: null };
        }
        if (table === 'follows') {
          const key = `${currentFilters['follower_id']}:${currentFilters['following_id']}`;
          const item = state.followsTable.get(key);
          return { data: item || null, error: null };
        }
        if (table === 'users' || table === 'profiles') {
          const id = (currentFilters['id'] as string) || '';
          return { data: state.usersTable.get(id) || null, error: null };
        }
        return { data: null, error: null };
      },
      insert: async (data: Record<string, unknown>) => {
        if (table === 'likes') {
          const item = { id: `like-${Date.now()}`, video_id: data.video_id as string, user_id: data.user_id as string };
          state.likesTable.set(`${item.video_id}:${item.user_id}`, item);
        } else if (table === 'follows') {
          const item = { id: `follow-${Date.now()}`, follower_id: data.follower_id as string, following_id: data.following_id as string };
          state.followsTable.set(`${item.follower_id}:${item.following_id}`, item);
        } else if (table === 'comments') {
          state.commentsTable.push(data as unknown as { id: string; video_id: string; user_id: string; text: string });
        }
        return { data: null, error: null };
      },
      delete: () => {
        return {
          eq: (col1: string, val1: unknown) => ({
            eq: async (col2: string, val2: unknown) => {
              if (table === 'likes') {
                const vid = col1 === 'video_id' ? (val1 as string) : (val2 as string);
                const uid = col1 === 'user_id' ? (val1 as string) : (val2 as string);
                state.likesTable.delete(`${vid}:${uid}`);
              } else if (table === 'follows') {
                const f1 = col1 === 'follower_id' ? (val1 as string) : (val2 as string);
                const f2 = col1 === 'following_id' ? (val1 as string) : (val2 as string);
                state.followsTable.delete(`${f1}:${f2}`);
              }
              return { data: null, error: null };
            },
          }),
        };
      },
      update: (data: Record<string, unknown>) => ({
        eq: async (col: string, val: unknown) => {
          if (table === 'users' || table === 'profiles') {
            const existing = state.usersTable.get(val as string) || { id: val as string, display_name: '', bio: '' };
            state.usersTable.set(val as string, { ...existing, ...data });
          }
          return { data: null, error: null };
        },
      }),
    };
    return builder;
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: state.currentUser }, error: null })),
        getSession: vi.fn(async () => ({
          data: {
            session: state.currentUser ? { access_token: 'valid-jwt-token' } : null,
          },
          error: null,
        })),
      },
      from: (table: string) => makeBuilder(table),
    },
  };
});

describe('Phase 0 Characterization Tests: Baseline Guardrails', () => {
  beforeEach(() => {
    state.currentUser = null;
    state.likesTable.clear();
    state.followsTable.clear();
    state.commentsTable = [];
    state.usersTable.clear();
  });

  describe('1. Authenticated Likes Characterization', () => {
    it('blocks unauthenticated users from liking videos', async () => {
      state.currentUser = null;
      const { result } = renderHook(() => useLikes('video-123', 5));

      let res: { error: string | null } | undefined;
      await act(async () => {
        res = await result.current.toggleLike();
      });

      expect(res?.error).toBe('Sign in to like videos');
      expect(result.current.liked).toBe(false);
      expect(result.current.likeCount).toBe(5);
      expect(state.likesTable.size).toBe(0);
    });

    it('allows authenticated users to toggle like and unlike', async () => {
      state.currentUser = { id: 'user-char-1' };
      const { result } = renderHook(() => useLikes('video-123', 5));

      // 1. Toggle like on
      await act(async () => {
        const res = await result.current.toggleLike();
        expect(res?.error).toBeNull();
      });

      expect(result.current.liked).toBe(true);
      expect(result.current.likeCount).toBe(6);
      expect(state.likesTable.has('video-123:user-char-1')).toBe(true);

      // 2. Toggle like off
      await act(async () => {
        const res = await result.current.toggleLike();
        expect(res?.error).toBeNull();
      });

      expect(result.current.liked).toBe(false);
      expect(result.current.likeCount).toBe(5);
      expect(state.likesTable.has('video-123:user-char-1')).toBe(false);
    });
  });

  describe('2. Authenticated Follows Characterization', () => {
    it('blocks unauthenticated users from following creators', async () => {
      state.currentUser = null;
      const { result } = renderHook(() => useFollow('creator-abc'));

      let res: { error: string | null } | undefined;
      await act(async () => {
        res = await result.current.toggleFollow();
      });

      expect(res?.error).toBe('Sign in to follow creators');
      expect(result.current.following).toBe(false);
      expect(state.followsTable.size).toBe(0);
    });

    it('allows authenticated users to toggle follow and unfollow', async () => {
      state.currentUser = { id: 'user-char-2' };
      const { result } = renderHook(() => useFollow('creator-abc'));

      // 1. Toggle follow on
      await act(async () => {
        const res = await result.current.toggleFollow();
        expect(res.error).toBeNull();
      });

      expect(result.current.following).toBe(true);
      expect(state.followsTable.has('user-char-2:creator-abc')).toBe(true);

      // 2. Toggle follow off
      await act(async () => {
        const res = await result.current.toggleFollow();
        expect(res.error).toBeNull();
      });

      expect(result.current.following).toBe(false);
      expect(state.followsTable.has('user-char-2:creator-abc')).toBe(false);
    });
  });

  describe('3. Video Upload Validation Guardrails', () => {
    it('validates supported video formats (MP4, WebM) and rejects unsupported formats', () => {
      const validMp4 = new File(['mp4 content'], 'clip.mp4', { type: 'video/mp4' });
      expect(validateVideoFile(validMp4).valid).toBe(true);

      const validWebm = new File(['webm content'], 'clip.webm', { type: 'video/webm' });
      expect(validateVideoFile(validWebm).valid).toBe(true);

      const invalidMov = new File(['mov content'], 'clip.mov', { type: 'video/quicktime' });
      expect(validateVideoFile(invalidMov).valid).toBe(false);

      const invalidDoc = new File(['pdf content'], 'file.pdf', { type: 'application/pdf' });
      expect(validateVideoFile(invalidDoc).valid).toBe(false);
    });

    it('enforces maximum 10-minute duration bound', () => {
      expect(validateVideoDuration(300).valid).toBe(true);
      expect(validateVideoDuration(600).valid).toBe(true);
      expect(validateVideoDuration(601).valid).toBe(false);
    });
  });
});
