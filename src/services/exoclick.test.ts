import { describe, it, expect } from 'vitest';
import {
  getAdConfig,
  shouldShowAd,
  getSkipDelay,
  getVastEndpoint,
} from '@/services/exoclick';
import type { UserTier } from '@/types';

describe('ad frequency rules', () => {
  it('shows an ad every 5 videos for anonymous users', () => {
    expect(shouldShowAd('anonymous', 5)).toBe(true);
    expect(shouldShowAd('anonymous', 10)).toBe(true);
    expect(shouldShowAd('anonymous', 15)).toBe(true);
  });

  it('does not show ads between anonymous ad intervals', () => {
    expect(shouldShowAd('anonymous', 1)).toBe(false);
    expect(shouldShowAd('anonymous', 3)).toBe(false);
    expect(shouldShowAd('anonymous', 4)).toBe(false);
    expect(shouldShowAd('anonymous', 6)).toBe(false);
  });

  it('never shows an ad on the first video', () => {
    expect(shouldShowAd('anonymous', 0)).toBe(false);
    expect(shouldShowAd('free', 0)).toBe(false);
    expect(shouldShowAd('pro', 0)).toBe(false);
  });

  it('shows an ad every 10 videos for free users', () => {
    expect(shouldShowAd('free', 10)).toBe(true);
    expect(shouldShowAd('free', 20)).toBe(true);
    expect(shouldShowAd('free', 5)).toBe(false);
    expect(shouldShowAd('free', 9)).toBe(false);
  });

  it('never shows ads for pro users', () => {
    for (let i = 0; i <= 40; i++) {
      expect(shouldShowAd('pro', i)).toBe(false);
    }
  });

  it('configures a 5 second skip delay for anonymous and free tiers', () => {
    expect(getSkipDelay('anonymous')).toBe(5);
    expect(getSkipDelay('free')).toBe(5);
    expect(getSkipDelay('pro')).toBe(0);
  });

  it('returns the correct frequency in the config', () => {
    expect(getAdConfig('anonymous').frequency).toBe(5);
    expect(getAdConfig('free').frequency).toBe(10);
    expect(getAdConfig('pro').frequency).toBe(0);
  });

  it('skip delay is always positive where ads are shown (5s rule)', () => {
    // Checklist rule: skip button appears after exactly 5 seconds
    expect(getAdConfig('anonymous').skipDelay).toBeGreaterThanOrEqual(5);
    expect(getAdConfig('free').skipDelay).toBeGreaterThanOrEqual(5);
  });
});

describe('pop-under compliance', () => {
  it('has no pop-under configuration anywhere (rule: NO pop-unders)', () => {
    const configs = ['anonymous', 'free', 'pro'] as UserTier[];
    for (const tier of configs) {
      const config = getAdConfig(tier) as unknown as Record<string, unknown>;
      expect(config).not.toHaveProperty('popUnder');
    }
  });
});

describe('VAST endpoint', () => {
  it('returns null when no zone is configured (placeholder state)', () => {
    expect(getVastEndpoint()).toBeNull();
  });

  it('builds the endpoint URL from the configured zone id', () => {
    // Simulate configured zone via env
    (import.meta.env as Record<string, string | undefined>).VITE_EXOCLICK_ZONE_ID = '12345';
    const endpoint = getVastEndpoint();
    expect(endpoint).toContain('zoneid=12345');
    expect(endpoint).toContain('vast.php');
    delete (import.meta.env as Record<string, string | undefined>).VITE_EXOCLICK_ZONE_ID;
  });
});
