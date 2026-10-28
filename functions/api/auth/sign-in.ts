import { isSecureContext, buildAuthCookieHeaders } from '../../_lib/cookies';
import { generateCsrfToken, verifyOrigin } from '../../_lib/csrf';
import { jsonResponse, errorResponse } from '../../_lib/http';
import { supabaseSignIn, fetchUserTier } from '../../_lib/supabaseAuth';
import { checkRateLimit, getClientIp, buildRateLimitResponse } from '../../_lib/rateLimit';
import { safeLog, safeError } from '../../_lib/logger';
import type { KVNamespaceLike } from '../../_lib/ageVerification';

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  RATE_LIMITS?: KVNamespaceLike;
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const ip = getClientIp(request);

  // Rate limit: 5 sign-in attempts per 60 seconds per IP
  const rateLimit = await checkRateLimit(`auth:sign-in:${ip}`, { maxRequests: 5, windowSeconds: 60 }, env.RATE_LIMITS);
  if (!rateLimit.allowed) {
    safeLog('auth:sign-in', `Rate limit exceeded for IP: ${ip}`);
    return buildRateLimitResponse(rateLimit);
  }

  if (!verifyOrigin(request)) {
    return errorResponse('Invalid origin', 403);
  }

  const supabaseUrl = env.SUPABASE_URL;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return errorResponse('Authentication service unavailable', 503);
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json() as { email?: string; password?: string };
  } catch {
    return errorResponse('Invalid JSON payload', 400);
  }

  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';

  if (!email || !password) {
    return errorResponse('Email and password are required', 400);
  }

  const result = await supabaseSignIn(supabaseUrl, anonKey, email, password);
  if ('error' in result) {
    safeError('auth:sign-in', `Failed sign-in attempt for email: ${email}`, { error: result.error });
    return errorResponse(result.error, result.status || 401);
  }

  const isSecure = isSecureContext(request);
  const csrfToken = generateCsrfToken();

  const cookies = buildAuthCookieHeaders({
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    csrfToken,
    expiresInSeconds: result.tokens.expiresIn,
    isSecure,
  });

  const tier = await fetchUserTier(
    supabaseUrl,
    anonKey,
    result.tokens.accessToken,
    result.user.id
  );

  safeLog('auth:sign-in', `Successful sign-in for user: ${result.user.id}`);

  return jsonResponse(
    {
      user: result.user,
      tier,
      csrfToken,
    },
    200,
    {},
    cookies
  );
}
