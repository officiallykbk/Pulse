/**
 * GET /api/age/status
 *
 * Checks whether the client currently holds a valid, unexpired age verification
 * token stored in the HttpOnly 'age_verified' cookie.
 *
 * Returns: { verified: boolean }
 * Cache-Control: no-store
 */

import { jsonResponse } from '../../_lib/http';
import {
  getAgeTokenFromRequest,
  verifyAgeToken,
  type KVNamespaceLike,
} from '../../_lib/ageVerification';

interface Env {
  AGE_VERIFICATIONS?: KVNamespaceLike;
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const token = getAgeTokenFromRequest(request);
  const isVerified = await verifyAgeToken(token, env.AGE_VERIFICATIONS);

  return jsonResponse({ verified: isVerified }, 200, {
    'Cache-Control': 'no-store, private',
  });
}
