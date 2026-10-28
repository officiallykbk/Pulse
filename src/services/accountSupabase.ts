import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sessionService } from './session';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function getProxyBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/supabase`;
  }
  return 'http://localhost:5173/api/supabase';
}

/**
 * Account Supabase client.
 * Connects exclusively through the same-origin Pages Function proxy (/api/supabase).
 *
 * Auth tokens never enter JavaScript:
 * - The server reads HttpOnly cookies (__Host-pulse_access / __Host-pulse_refresh)
 * - The proxy attaches the user JWT upstream and preserves Supabase RLS
 * - accessToken callback returns null, disabling the browser client auth namespace
 * - State-changing mutations automatically include x-csrf-token from double-submit cookie
 */
export const accountSupabase: SupabaseClient = createClient(getProxyBaseUrl(), supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => null,
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers);
      const method = (options.method || 'GET').toUpperCase();

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = sessionService.getCsrfToken();
        if (csrfToken) {
          headers.set('x-csrf-token', csrfToken);
        }
      }

      return fetch(url, {
        ...options,
        headers,
        credentials: 'same-origin',
      });
    },
  },
});
