import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isTrustAuthV2Enabled } from './features';

describe('client feature flags', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when VITE_TRUST_AUTH_V2 is unset', () => {
    vi.stubEnv('VITE_TRUST_AUTH_V2', '');
    expect(isTrustAuthV2Enabled()).toBe(false);
  });

  it('returns true when VITE_TRUST_AUTH_V2 is "true" or "1"', () => {
    vi.stubEnv('VITE_TRUST_AUTH_V2', 'true');
    expect(isTrustAuthV2Enabled()).toBe(true);

    vi.stubEnv('VITE_TRUST_AUTH_V2', '1');
    expect(isTrustAuthV2Enabled()).toBe(true);
  });

  it('returns false for other values', () => {
    vi.stubEnv('VITE_TRUST_AUTH_V2', 'false');
    expect(isTrustAuthV2Enabled()).toBe(false);

    vi.stubEnv('VITE_TRUST_AUTH_V2', '0');
    expect(isTrustAuthV2Enabled()).toBe(false);
  });
});
