import { useState, useEffect, useCallback } from 'react';
import { sessionService } from '@/services/session';
import { supabase } from '@/services/supabase';
import type { UserTier, AuthState } from '@/types';

async function fetchTier(userId: string): Promise<UserTier> {
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('expires_at', { ascending: false })
    .limit(1);

  const sub = subs?.[0];
  if (sub) {
    if (sub.expires_at) {
      const expires = new Date(sub.expires_at).getTime();
      if (expires > Date.now()) return 'pro';
    } else {
      return 'pro';
    }
  }
  return 'free';
}

export function useAuth(): AuthState & {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>(() => {
    const snap = sessionService.getSnapshot();
    return {
      user: snap.user,
      tier: snap.tier,
      loading: snap.loading,
    };
  });

  useEffect(() => {
    let cancelled = false;

    // Bridge with Supabase auth (allows tests mocking supabase.auth to execute predictably)
    const subAuth = supabase.auth;
    let authUnsubscribe: (() => void) | undefined;

    if (subAuth?.getSession && subAuth?.onAuthStateChange) {
      subAuth.getSession().then(({ data: { session } }) => {
        if (cancelled) return;
        if (session?.user) {
          (async () => {
            const tier = await fetchTier(session.user.id);
            if (!cancelled) {
              setState({
                user: { id: session.user.id, email: session.user.email ?? '' },
                tier,
                loading: false,
              });
            }
          })();
        } else {
          const snap = sessionService.getSnapshot();
          if (snap.user) {
            setState({ user: snap.user, tier: snap.tier, loading: false });
          } else {
            setState({ user: null, tier: 'anonymous', loading: false });
          }
        }
      });

      const { data: listener } = subAuth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        (async () => {
          if (session?.user) {
            const tier = await fetchTier(session.user.id);
            if (!cancelled) {
              setState({
                user: { id: session.user.id, email: session.user.email ?? '' },
                tier,
                loading: false,
              });
            }
          } else {
            if (!cancelled) {
              setState({ user: null, tier: 'anonymous', loading: false });
            }
          }
        })();
      });
      authUnsubscribe = listener.subscription?.unsubscribe;
    }

    // Subscribe to SessionModule
    const sessionUnsubscribe = sessionService.subscribe(() => {
      if (cancelled) return;
      const snap = sessionService.getSnapshot();
      setState({
        user: snap.user,
        tier: snap.tier,
        loading: snap.loading,
      });
    });

    sessionService.bootstrap().catch(() => {});

    return () => {
      cancelled = true;
      authUnsubscribe?.();
      sessionUnsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (supabase.auth?.signInWithPassword) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
    }
    const res = await sessionService.signIn(email, password);
    return { error: res.error };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (supabase.auth?.signUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return { error: error.message };
    }
    const res = await sessionService.signUp(email, password);
    return { error: res.error };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase.auth?.signOut) {
      await supabase.auth.signOut();
    }
    await sessionService.signOut();
    setState({ user: null, tier: 'anonymous', loading: false });
  }, []);

  return { ...state, signIn, signUp, signOut };
}
