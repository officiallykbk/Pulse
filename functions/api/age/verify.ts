/**
 * POST /api/age/verify
 *
 * Privacy-first age declaration endpoint.
 *
 * Requirements:
 * 1. Affirmative request body: { declaredOver18: true }
 * 2. Origin/Referer check to prevent cross-site form submissions
 * 3. 32 cryptographically random bytes generated for opaque token
 * 4. Token persisted in Cloudflare KV with 30-day (2,592,000s) TTL
 * 5. HttpOnly, SameSite=Strict 'age_verified' cookie set
 * 6. Zero PII collected or logged
 */

import { jsonResponse, errorResponse } from '../../_lib/http';
import { isSecureContext } from '../../_lib/cookies';
import { verifyOrigin } from '../../_lib/csrf';
import {
  generateAgeToken,
  saveAgeVerification,
  buildAgeCookieHeader,
  type KVNamespaceLike,
} from '../../_lib/ageVerification';

interface Env {
  AGE_VERIFICATIONS?: KVNamespaceLike;
}

export async function onRequestPost({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  // 1. Validate Origin / Referer
  if (!verifyOrigin(request)) {
    return errorResponse('Invalid origin for age verification', 403);
  }

  // 2. Validate request payload: must strictly contain declaredOver18: true
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    (body as { declaredOver18?: unknown }).declaredOver18 !== true
  ) {
    return errorResponse('Affirmation that you are 18+ is required', 400);
  }

  // 3. Generate 32-byte opaque token and persist in KV with 30-day TTL
  const token = generateAgeToken();
  await saveAgeVerification(token, env.AGE_VERIFICATIONS);

  // 4. Set HttpOnly, SameSite=Strict cookie
  const isSecure = isSecureContext(request);
  const cookieHeader = buildAgeCookieHeader(token, isSecure);

  return jsonResponse(
    { verified: true },
    200,
    { 'Cache-Control': 'no-store, private' },
    [cookieHeader]
  );
}
