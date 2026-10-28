import { publicSupabase } from './publicSupabase';
import { accountSupabase } from './accountSupabase';
import { sessionService } from './session';

/**
 * Temporary compatibility export for Supabase.
 * - persistSession is disabled so access/refresh tokens NEVER enter Web Storage.
 * - Account mutations route through accountSupabase (same-origin proxy with HttpOnly cookies).
 * - Public reads route directly to Supabase with the anon key.
 * - auth namespace forwards to the Session module and never returns tokens.
 */
export const supabase = {
  ...publicSupabase,
  from: (table: string) => {
    const accountTables = [
      'likes',
      'follows',
      'comments',
      'saved_videos',
      'video_watch_progress',
      'profiles',
      'users',
      'subscriptions',
      'feedback',
    ];
    if (accountTables.includes(table)) {
      return accountSupabase.from(table);
    }
    return publicSupabase.from(table);
  },
  rpc: (fn: string, args?: Record<string, unknown>) => {
    const accountRpcs = ['record_watch_progress', 'claim_video_job'];
    if (accountRpcs.includes(fn)) {
      return accountSupabase.rpc(fn, args);
    }
    return publicSupabase.rpc(fn, args);
  },
  auth: {
    getUser: async () => {
      const snap = sessionService.getSnapshot();
      return { data: { user: snap.user }, error: null };
    },
    getSession: async () => {
      const snap = sessionService.getSnapshot();
      return {
        data: {
          session: snap.user
            ? ({
                user: snap.user,
                access_token: '',
              } as { user: typeof snap.user; access_token?: string })
            : null,
        },
        error: null,
      };
    },
    onAuthStateChange: (callback: (event: string, session: { user: { id: string; email?: string } } | null) => void) => {
      const unsubscribe = sessionService.subscribe(() => {
        const snap = sessionService.getSnapshot();
        callback('SIGNED_IN', snap.user ? { user: { id: snap.user.id, email: snap.user.email } } : null);
      });
      return { data: { subscription: { unsubscribe } } };
    },
    signInWithPassword: async (credentials: { email: string; password?: string }) => {
      const res = await sessionService.signIn(credentials.email, credentials.password || '');
      return { error: res.error ? { message: res.error } : null };
    },
    signUp: async (credentials: { email: string; password?: string }) => {
      const res = await sessionService.signUp(credentials.email, credentials.password || '');
      return { error: res.error ? { message: res.error } : null };
    },
    signOut: async () => {
      await sessionService.signOut();
      return { error: null };
    },
  },
};

export { publicSupabase, accountSupabase };
