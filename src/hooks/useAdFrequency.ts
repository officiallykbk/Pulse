import type { UserTier, AdConfig } from '@/types';
import { getAdConfig, shouldShowAd as shouldShowAdFn } from '@/services/exoclick';

export function useAdFrequency(tier: UserTier) {
  const config: AdConfig = getAdConfig(tier);

  const shouldShowAd = (videoIndex: number): boolean => {
    return shouldShowAdFn(tier, videoIndex);
  };

  return {
    shouldShowAd,
    config,
    skipDelay: config.skipDelay,
  };
}
