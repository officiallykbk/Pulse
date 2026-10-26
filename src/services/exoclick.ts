import type { UserTier, AdConfig } from '@/types';

const AD_CONFIGS: Record<UserTier, { frequency: number; skipDelay: number }> = {
  anonymous: { frequency: 5, skipDelay: 5 },
  free: { frequency: 10, skipDelay: 5 },
  pro: { frequency: 0, skipDelay: 0 },
};

export function getAdConfig(tier: UserTier): AdConfig {
  return AD_CONFIGS[tier];
}

export function shouldShowAd(tier: UserTier, videoIndex: number): boolean {
  const config = AD_CONFIGS[tier];
  if (tier === 'pro' || config.frequency === 0) return false;
  return videoIndex > 0 && videoIndex % config.frequency === 0;
}

export function getSkipDelay(tier: UserTier): number {
  return AD_CONFIGS[tier].skipDelay;
}

// ExoClick in-stream VAST endpoint. Placeholder until the publisher account is
// live and the zone ID is provided — see PRODUCTION_TODO.md Phase 2.
export function getVastEndpoint(): string | null {
  const zoneId = import.meta.env.VITE_EXOCLICK_ZONE_ID as string | undefined;
  if (!zoneId) return null;
  return `https://s.magsrv.com/vast.php?zoneid=${encodeURIComponent(zoneId)}`;
}
