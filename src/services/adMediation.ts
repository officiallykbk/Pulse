import { fetchVastAd, type ParsedVastAd } from '@/services/vast';

export type AdNetworkId = 'exoclick' | 'trafficjunky' | 'adsfw' | 'trafficstars' | 'custom';

export interface AdNetworkMetadata {
  id: AdNetworkId;
  name: string;
  description: string;
  supports5sSkip: boolean;
  africanFillRate: 'High' | 'Medium' | 'Targeted';
}

export const AD_NETWORKS_METADATA: Record<AdNetworkId, AdNetworkMetadata> = {
  exoclick: {
    id: 'exoclick',
    name: 'ExoClick',
    description: 'Tier 1 open-web VAST video network with massive African coverage and $20 min payout.',
    supports5sSkip: true,
    africanFillRate: 'High',
  },
  trafficjunky: {
    id: 'trafficjunky',
    name: 'TrafficJunky',
    description: 'Premium Aylo / MindGeek in-stream & Shorties network with high-demand video inventory.',
    supports5sSkip: true,
    africanFillRate: 'Medium',
  },
  adsfw: {
    id: 'adsfw',
    name: 'AD-SFW',
    description: 'Boutique Adult Safe-for-Work network with vetted, non-explicit dating and wellness creatives.',
    supports5sSkip: true,
    africanFillRate: 'Targeted',
  },
  trafficstars: {
    id: 'trafficstars',
    name: 'TrafficStars',
    description: 'High-volume international network with robust VAST 2/3/4 pre-roll video support.',
    supports5sSkip: true,
    africanFillRate: 'High',
  },
  custom: {
    id: 'custom',
    name: 'Direct Sponsor / Custom VAST',
    description: 'Direct advertiser or custom external VAST 2.0-4.0 compliant linear video tag.',
    supports5sSkip: true,
    africanFillRate: 'Targeted',
  },
};

/**
 * Default fallback waterfall order:
 * 1. ExoClick (Primary Tier 3 African fill)
 * 2. TrafficJunky (Premium CPMs)
 * 3. AD-SFW (Brand-safe curated ads)
 * 4. TrafficStars (Global redundancy)
 * 5. Custom (Direct advertisers)
 */
export const DEFAULT_WATERFALL_ORDER: AdNetworkId[] = [
  'exoclick',
  'trafficjunky',
  'adsfw',
  'trafficstars',
  'custom',
];

/**
 * Resolves the configured VAST URL for a specific ad network from environment variables.
 */
export function getNetworkVastUrl(network: AdNetworkId): string | null {
  switch (network) {
    case 'exoclick': {
      const directUrl = import.meta.env.VITE_EXOCLICK_VAST_URL as string | undefined;
      if (directUrl) return directUrl;
      const zoneId = import.meta.env.VITE_EXOCLICK_ZONE_ID as string | undefined;
      if (zoneId) {
        return `https://s.magsrv.com/vast.php?zoneid=${encodeURIComponent(zoneId)}`;
      }
      return null;
    }
    case 'trafficjunky':
      return (import.meta.env.VITE_TRAFFICJUNKY_VAST_URL as string | undefined) || null;
    case 'adsfw':
      return (import.meta.env.VITE_AD_SFW_VAST_URL as string | undefined) || null;
    case 'trafficstars':
      return (import.meta.env.VITE_TRAFFICSTARS_VAST_URL as string | undefined) || null;
    case 'custom':
      return (import.meta.env.VITE_CUSTOM_VAST_URL as string | undefined) || null;
    default:
      return null;
  }
}

/**
 * Returns all currently configured ad networks with their active VAST tags.
 */
export function getActiveNetworks(): { id: AdNetworkId; name: string; url: string }[] {
  return DEFAULT_WATERFALL_ORDER.map((id) => {
    const url = getNetworkVastUrl(id);
    return url ? { id, name: AD_NETWORKS_METADATA[id].name, url } : null;
  }).filter((item): item is { id: AdNetworkId; name: string; url: string } => item !== null);
}

export interface WaterfallResult {
  ad: ParsedVastAd;
  network: AdNetworkId;
  networkName: string;
}

/**
 * Waterfall ad mediation loader:
 * Loops through the priority networks in order until one successfully fills with a valid video ad.
 * Fails safely and immediately to null if all providers return no-fill or error.
 */
export async function fetchWaterfallAd(
  preferredOrder: AdNetworkId[] = DEFAULT_WATERFALL_ORDER
): Promise<WaterfallResult | null> {
  for (const networkId of preferredOrder) {
    const endpoint = getNetworkVastUrl(networkId);
    if (!endpoint) continue;

    try {
      const ad = await fetchVastAd(endpoint);
      if (ad && ad.videoUrl) {
        return {
          ad,
          network: networkId,
          networkName: AD_NETWORKS_METADATA[networkId].name,
        };
      }
    } catch {
      // Continue to next network in the waterfall
    }
  }

  return null;
}

/**
 * Strict Outbound CTA Guard:
 * Opens click-through URLs in a brand-safe, isolated new tab.
 * Guarantees zero pop-unders, zero redirects, and zero javascript injection.
 */
export function safeOpenClickThrough(url?: string): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  // Strictly enforce http or https
  if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) {
    return false;
  }

  try {
    if (typeof window !== 'undefined') {
      const win = window.open(trimmed, '_blank', 'noopener,noreferrer');
      if (win) {
        win.opener = null;
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
