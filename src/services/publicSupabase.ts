import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { safeLocalStorage } from '@/lib/safeStorage';
import { fetchWithTimeout } from '@/lib/safeFetch';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

/**
 * Public Supabase client.
 * Connects directly to Supabase origin with anon key.
 * Auth persistence and navigator.locks are disabled/shielded for all browsers & privacy extensions.
 * Used ONLY for public reads: public feed, public search, public profiles, and sharing.
 */
export const publicSupabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: safeLocalStorage,
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
  global: {
    fetch: (url, options) => fetchWithTimeout(url, options),
  },
});
