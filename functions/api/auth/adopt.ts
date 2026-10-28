import { isSecureContext, buildAuthCookieHeaders } from '../../_lib/cookies';
import { generateCsrfToken, verifyOrigin } from '../../_lib/csrf';
import { jsonResponse, errorResponse } from '../../_lib/http';
import { supabaseGetUser, supabaseRefreshToken, fetchUserTier } from '../../_lib/supabaseAuth';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  if (!verifyOrigin(request)) {
    return errorResponse('Invalid origin', 403);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Authentication service unavailable', 503);
  }

  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await request.json() as { access_token?: string; refresh_token?: string };
  } catch {
    return errorResponse('Invalid JSON payload', 400);
  }

  const accessToken = body.access_token?.trim();
  const refreshToken = body.refresh_token?.trim();

  if (!accessToken || !refreshToken) {
    return errorResponse('Missing legacy credentials', 400);
  }

  const isSecure = isSecureContext(request);
  let resolvedUser: { id: string; email: string } | null = null;
  let finalAccessToken = accessToken;
  let finalRefreshToken = refreshToken;
  let expiresInSeconds = 3600;

  // 1. Try existing access token
  const userRes = await supabaseGetUser(supabaseUrl, anonKey, accessToken);
  if (userRes.user) {
    resolvedUser = userRes.user;
  } else {
    // 2. If access token expired, attempt refresh
    const refreshRes = await supabaseRefreshToken(supabaseUrl, anonKey, refreshToken);
    if ('user' in refreshRes && refreshRes.tokens.accessToken) {
      resolvedUser = refreshRes.user;
      finalAccessToken = refreshRes.tokens.accessToken;
      finalRefreshToken = refreshRes.tokens.refreshToken;
      expiresInSeconds = refreshRes.tokens.expiresIn;
    }
  }

  if (!resolvedUser) {
    return errorResponse('Legacy session could not be verified or is expired', 401);
  }

  const csrfToken = generateCsrfToken();
  const cookies = buildAuthCookieHeaders({
    accessToken: finalAccessToken,
    refreshToken: finalRefreshToken,
    csrfToken,
    expiresInSeconds,
    isSecure,
  });

  const tier = await fetchUserTier(
    supabaseUrl,
    anonKey,
    finalAccessToken,
    resolvedUser.id
  );

  return jsonResponse(
    {
      user: resolvedUser,
      tier,
      csrfToken,
    },
    200,
    {},
    cookies
  );
}
