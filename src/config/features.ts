/**
 * Feature flag helper for staged trust/privacy architecture rollout.
 * VITE_TRUST_AUTH_V2 is only a public rollout selector, never a secret.
 */
export function isTrustAuthV2Enabled(): boolean {
  const envVal = import.meta.env.VITE_TRUST_AUTH_V2;
  return envVal === 'true' || envVal === '1';
}
