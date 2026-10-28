/**
 * Server-side feature flag helper for staged trust/privacy architecture rollout.
 * TRUST_AUTH_V2 in Cloudflare Pages Functions env determines whether the cookie/proxy
 * trust seam is enforced.
 */
export function isTrustAuthV2ServerEnabled(env?: Record<string, unknown>): boolean {
  if (!env) return false;
  const flag = env.TRUST_AUTH_V2;
  return flag === 'true' || flag === '1' || flag === true;
}
