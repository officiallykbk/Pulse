import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import type { UserTier } from '@/types';

const state = vi.hoisted(() => ({
  session: null as { user: { id: string; email?: string } } | null,
  subscriptions: [] as Array<{ status: string; expires_at: string | null }>,
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => {
        state.session = null;
        return { error: null };
      }),
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === 'subscriptions' ? state.subscriptions[0] ?? null : null,
          error: null,
        }),
      };
      return builder;
    },
  },
}));

describe('useAuth tier detection', () => {
  beforeEach(() => {
    state.session = null;
    state.subscriptions = [];
  });

  it('reports anonymous for visitors with no session', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('reports free for signed-in users without an active subscription', async () => {
    state.session = { user: { id: 'u1', email: 'a@b.c' } };
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('free');
    expect(result.current.user?.email).toBe('a@b.c');
  });

  it('reports pro for an active unexpired subscription', async () => {
    state.session = { user: { id: 'u1', email: 'a@b.c' } };
    state.subscriptions = [
      { status: 'active', expires_at: new Date(Date.now() + 86400_000).toISOString() },
    ];
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('pro');
  });

  it('reports free for an expired subscription (expired Pro falls back)', async () => {
    state.session = { user: { id: 'u1', email: 'a@b.c' } };
    state.subscriptions = [
      { status: 'active', expires_at: new Date(Date.now() - 86400_000).toISOString() },
    ];
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tier).toBe('free');
  });

  it('signs out and returns to anonymous', async () => {
    state.session = { user: { id: 'u1', email: 'a@b.c' } };
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.tier).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('exposes tier as one of the three valid values', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(['anonymous', 'free', 'pro']).toContain(result.current.tier as UserTier);
  });
});
