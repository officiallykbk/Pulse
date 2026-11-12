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
    const strictAccountTables = [
      'likes',
      'follows',
      'comment_likes',
      'saved_videos',
      'video_watch_progress',
      'video_viewing_insights',
      'users',
      'subscriptions',
      'feedback',
      'reports',
    ];
    const sharedTables = ['profiles', 'comments', 'videos'];
    const isSignedIn = Boolean(sessionService.getSnapshot().user);

    if (strictAccountTables.includes(table) || (isSignedIn && sharedTables.includes(table))) {
      return accountSupabase.from(table);
    }
    return publicSupabase.from(table);
  },
  rpc: (fn: string, args?: Record<string, unknown>) => {
    const strictAccountRpcs = [
      'record_watch_progress',
      'claim_video_job',
      'increment_view_count',
      'increment_share_count',
      'record_video_viewing_insight',
      'save_video_watch_progress',
    ];
    const sharedRpcs = ['get_comment_reactions'];
    const isSignedIn = Boolean(sessionService.getSnapshot().user);

    if (strictAccountRpcs.includes(fn) || (isSignedIn && sharedRpcs.includes(fn))) {
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
