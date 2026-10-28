/**
 * Server-side Session Resolver and Cookie Rotator.
 * Reads HttpOnly auth cookies, verifies or refreshes with Supabase,
 * and emits rotated cookies when tokens are renewed.
 */

import { parseCookies, getCookieNames, isSecureContext, buildAuthCookieHeaders, buildClearAuthCookieHeaders } from './cookies';
import { generateCsrfToken } from './csrf';
import { supabaseGetUser, supabaseRefreshToken, fetchUserTier, type SanitizedUser } from './supabaseAuth';

export interface ResolvedSession {
  user: SanitizedUser | null;
  accessToken: string | null;
  tier: 'pro' | 'free' | 'anonymous';
  newCookies: string[];
}

export async function resolveSession(
  request: Request,
  env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string }
): Promise<ResolvedSession> {
  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return { user: null, accessToken: null, tier: 'anonymous', newCookies: [] };
  }

  const isSecure = isSecureContext(request);
  const cookies = parseCookies(request);
  const hostNames = getCookieNames(true);
  const plainNames = getCookieNames(false);

  const accessToken = cookies[hostNames.access] || cookies[plainNames.access] || null;
  const refreshToken = cookies[hostNames.refresh] || cookies[plainNames.refresh] || null;
  const csrfToken = cookies[hostNames.csrf] || cookies[plainNames.csrf] || null;

  // 1. If access token exists, verify with Supabase
  if (accessToken) {
    const userRes = await supabaseGetUser(supabaseUrl, anonKey, accessToken);
    if (userRes.user) {
      const tier = await fetchUserTier(supabaseUrl, anonKey, accessToken, userRes.user.id);
      return {
        user: userRes.user,
        accessToken,
        tier,
        newCookies: [],
      };
    }
  }

  // 2. If access token is missing or expired, attempt refresh using refresh token
  if (refreshToken) {
    const refreshResult = await supabaseRefreshToken(supabaseUrl, anonKey, refreshToken);
    if ('user' in refreshResult && refreshResult.tokens.accessToken) {
      const newCsrf = csrfToken || generateCsrfToken();
      const updatedCookies = buildAuthCookieHeaders({
        accessToken: refreshResult.tokens.accessToken,
        refreshToken: refreshResult.tokens.refreshToken,
        csrfToken: newCsrf,
        expiresInSeconds: refreshResult.tokens.expiresIn,
        isSecure,
      });

      const tier = await fetchUserTier(
        supabaseUrl,
        anonKey,
        refreshResult.tokens.accessToken,
        refreshResult.user.id
      );

      return {
        user: refreshResult.user,
        accessToken: refreshResult.tokens.accessToken,
        tier,
        newCookies: updatedCookies,
      };
    }

    // Refresh failed: tokens are revoked or corrupt -> clear cookies
    const clearCookies = buildClearAuthCookieHeaders(isSecure);
    return {
      user: null,
      accessToken: null,
      tier: 'anonymous',
      newCookies: clearCookies,
    };
  }

  // 3. No session credentials present
  return {
    user: null,
    accessToken: null,
    tier: 'anonymous',
    newCookies: [],
  };
}
