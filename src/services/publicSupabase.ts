import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Public Supabase client.
 * Connects directly to Supabase origin with anon key.
 * Auth persistence is completely disabled.
 * Used ONLY for public reads: public feed, public search, public profiles, and sharing.
 */
export const publicSupabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
