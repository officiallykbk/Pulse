import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import type { UserTier, AuthState } from '@/types';

async function fetchTier(userId: string): Promise<UserTier> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

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
  const [state, setState] = useState<AuthState>({
    user: null,
    tier: 'anonymous',
    loading: true,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        (async () => {
          const tier = await fetchTier(session.user.id);
          setState({
            user: { id: session.user.id, email: session.user.email ?? '' },
            tier,
            loading: false,
          });
        })();
      } else {
        setState({ user: null, tier: 'anonymous', loading: false });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session?.user) {
          const tier = await fetchTier(session.user.id);
          setState({
            user: { id: session.user.id, email: session.user.email ?? '' },
            tier,
            loading: false,
          });
        } else {
          setState({ user: null, tier: 'anonymous', loading: false });
        }
      })();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, tier: 'anonymous', loading: false });
  }, []);

  return { ...state, signIn, signUp, signOut };
}
