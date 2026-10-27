import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNetworkVastUrl,
  fetchWaterfallAd,
  safeOpenClickThrough,
  AD_NETWORKS_METADATA,
} from './adMediation';
import * as vastModule from './vast';

describe('Ad Mediation & Waterfall Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('correctly configures metadata for all supported ad networks', () => {
    expect(AD_NETWORKS_METADATA.exoclick.supports5sSkip).toBe(true);
    expect(AD_NETWORKS_METADATA.trafficjunky.supports5sSkip).toBe(true);
    expect(AD_NETWORKS_METADATA.adsfw.supports5sSkip).toBe(true);
    expect(AD_NETWORKS_METADATA.trafficstars.supports5sSkip).toBe(true);
    expect(AD_NETWORKS_METADATA.custom.supports5sSkip).toBe(true);
  });

  it('resolves ExoClick endpoint from zone ID or direct VAST URL', () => {
    vi.stubEnv('VITE_EXOCLICK_ZONE_ID', '98765');
    expect(getNetworkVastUrl('exoclick')).toBe('https://s.magsrv.com/vast.php?zoneid=98765');

    vi.stubEnv('VITE_EXOCLICK_VAST_URL', 'https://custom.vast.com/tag');
    expect(getNetworkVastUrl('exoclick')).toBe('https://custom.vast.com/tag');
  });

  it('resolves TrafficJunky, AD-SFW, and TrafficStars endpoints from env', () => {
    vi.stubEnv('VITE_TRAFFICJUNKY_VAST_URL', 'https://tj.adserver.com/vast/feed');
    vi.stubEnv('VITE_AD_SFW_VAST_URL', 'https://adsfw.network/vast/linear');
    vi.stubEnv('VITE_TRAFFICSTARS_VAST_URL', 'https://trafficstars.com/vast/zone/44');

    expect(getNetworkVastUrl('trafficjunky')).toBe('https://tj.adserver.com/vast/feed');
    expect(getNetworkVastUrl('adsfw')).toBe('https://adsfw.network/vast/linear');
    expect(getNetworkVastUrl('trafficstars')).toBe('https://trafficstars.com/vast/zone/44');
  });

  it('waterfalls to the second network when the primary network returns no fill', async () => {
    vi.stubEnv('VITE_EXOCLICK_ZONE_ID', '111');
    vi.stubEnv('VITE_TRAFFICJUNKY_VAST_URL', 'https://tj.com/vast');

    const spyFetchVast = vi.spyOn(vastModule, 'fetchVastAd');
    // First call (ExoClick) -> empty/null
    // Second call (TrafficJunky) -> valid ad
    spyFetchVast
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        videoUrl: 'https://cdn.example.com/tj_ad.mp4',
        title: 'TrafficJunky Premium Reel',
        clickThroughUrl: 'https://tj.example.com/landing',
      });

    const result = await fetchWaterfallAd(['exoclick', 'trafficjunky']);

    expect(result).not.toBeNull();
    expect(result?.network).toBe('trafficjunky');
    expect(result?.ad.videoUrl).toBe('https://cdn.example.com/tj_ad.mp4');
    expect(result?.ad.title).toBe('TrafficJunky Premium Reel');
  });

  it('returns null safely if all networks in the waterfall fail to fill', async () => {
    vi.stubEnv('VITE_EXOCLICK_ZONE_ID', '111');
    vi.spyOn(vastModule, 'fetchVastAd').mockResolvedValue(null);

    const result = await fetchWaterfallAd(['exoclick']);
    expect(result).toBeNull();
  });

  it('strict outbound CTA guard: blocks malicious javascript/data schemes and only opens http/https in isolated tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ opener: null } as unknown as Window);

    expect(safeOpenClickThrough('javascript:alert(1)')).toBe(false);
    expect(safeOpenClickThrough('data:text/html,<script></script>')).toBe(false);
    expect(safeOpenClickThrough('')).toBe(false);
    expect(safeOpenClickThrough(undefined)).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();

    const success = safeOpenClickThrough('https://verified-sponsor.com/offer');
    expect(success).toBe(true);
    expect(openSpy).toHaveBeenCalledWith(
      'https://verified-sponsor.com/offer',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
