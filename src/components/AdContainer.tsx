import { AdController } from '@/components/AdController';
import type { UserTier } from '@/types';
import type { AdNetworkId } from '@/services/adMediation';

export interface AdContainerProps {
  tier: UserTier;
  onNext: () => void;
  onUpgrade: () => void;
  onLockChange: (locked: boolean) => void;
  vastUrl?: string | null;
  waterfallOrder?: AdNetworkId[];
}

/**
 * AdContainer serves as the feed-integrated container for Pulse sponsored content,
 * delegating to the AdController with strict in-stream 5-second skip enforcement.
 */
export function AdContainer(props: AdContainerProps) {
  return <AdController {...props} />;
}
