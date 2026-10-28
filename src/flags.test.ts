import { describe, it, expect } from 'vitest';
import { isTrustAuthV2ServerEnabled } from '../functions/_lib/flags';

describe('server feature flags', () => {
  it('returns false when env is undefined or TRUST_AUTH_V2 is not set', () => {
    expect(isTrustAuthV2ServerEnabled(undefined)).toBe(false);
    expect(isTrustAuthV2ServerEnabled({})).toBe(false);
  });

  it('returns true when TRUST_AUTH_V2 is "true", "1", or boolean true', () => {
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: 'true' })).toBe(true);
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: '1' })).toBe(true);
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: true })).toBe(true);
  });

  it('returns false when TRUST_AUTH_V2 is false or any other string', () => {
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: 'false' })).toBe(false);
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: '0' })).toBe(false);
    expect(isTrustAuthV2ServerEnabled({ TRUST_AUTH_V2: false })).toBe(false);
  });
});
