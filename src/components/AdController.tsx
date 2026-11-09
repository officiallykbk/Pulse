import { useState, useEffect, useRef, useCallback } from 'react';
import { SkipForward, Crown, Lock, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import type { UserTier } from '@/types';
import { getSkipDelay } from '@/services/exoclick';
import { fetchVastAd, fireTrackingBeacon, type ParsedVastAd } from '@/services/vast';
import {
  fetchWaterfallAd,
  safeOpenClickThrough,
  type AdNetworkId,
} from '@/services/adMediation';
import { loadAppSettings } from '@/lib/settings';
import { trackFunnelEvent } from '@/lib/funnelTelemetry';

export interface AdControllerProps {
  tier: UserTier;
  onNext: () => void;
  onUpgrade: () => void;
  onLockChange: (locked: boolean) => void;
  vastUrl?: string | null;
  waterfallOrder?: AdNetworkId[];
}

export type AdStatus = 'resolving' | 'filled' | 'no-fill' | 'error';

/**
 * Checks if the browser or user has activated Data Saver mode.
 * When enabled, Pulse avoids fetching heavy multi-megabyte VAST video payloads.
 */
function isDataSaverActive(): boolean {
  if (typeof navigator !== 'undefined' && (navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData) {
    return true;
  }
  try {
    const settings = loadAppSettings();
    return !!settings.dataSaver;
  } catch {
    return false;
  }
}

export function AdController({
  tier,
  onNext,
  onUpgrade,
  onLockChange,
  vastUrl,
  waterfallOrder,
}: AdControllerProps) {
  const initialDelay = getSkipDelay(tier);
  const [adStatus, setAdStatus] = useState<AdStatus>('resolving');
  const [canSkip, setCanSkip] = useState(initialDelay <= 0);
  const [timeLeft, setTimeLeft] = useState(initialDelay);
  const [adVideo, setAdVideo] = useState<ParsedVastAd | null>(null);
  const [networkName, setNetworkName] = useState<string>('Pulse Partner');
  const [muted, setMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // VAST quartile tracking state
  const quartileFiredRef = useRef({
    start: false,
    firstQuartile: false,
    midpoint: false,
    thirdQuartile: false,
    complete: false,
  });

  // 1. Fetch In-Stream VAST Ad via Mediation Waterfall (Respects Data Saver)
  useEffect(() => {
    let cancelled = false;

    async function loadAd() {
      trackFunnelEvent('ad_opportunity', { tier });

      // If Data Saver is active, skip heavy video auction and use lightweight sponsor card
      if (isDataSaverActive()) {
        if (!cancelled) {
          setAdStatus('no-fill');
          setCanSkip(true);
          onLockChange(false);
          trackFunnelEvent('ad_no_fill');
        }
        return;
      }

      setAdStatus('resolving');

      try {
        if (vastUrl) {
          const ad = await fetchVastAd(vastUrl);
          if (!cancelled) {
            if (ad?.videoUrl) {
              setAdVideo(ad);
              setNetworkName('Direct Sponsor');
              setAdStatus('filled');
              trackFunnelEvent('ad_filled', { network: 'Direct Sponsor' });
            } else {
              setAdStatus('no-fill');
              setCanSkip(true);
              onLockChange(false);
              trackFunnelEvent('ad_no_fill');
            }
          }
        } else {
          const waterfall = await fetchWaterfallAd(waterfallOrder);
          if (!cancelled) {
            if (waterfall?.ad.videoUrl) {
              setAdVideo(waterfall.ad);
              setNetworkName(waterfall.networkName);
              setAdStatus('filled');
              trackFunnelEvent('ad_filled', { network: waterfall.networkName });
            } else {
              setAdStatus('no-fill');
              setCanSkip(true);
              onLockChange(false);
              trackFunnelEvent('ad_no_fill');
            }
          }
        }
      } catch {
        if (!cancelled) {
          setAdStatus('error');
          setCanSkip(true);
          onLockChange(false);
          trackFunnelEvent('ad_no_fill');
        }
      }
    }

    loadAd();

    return () => {
      cancelled = true;
    };
  }, [vastUrl, waterfallOrder, onLockChange, tier]);

  // 2. Mandatory Lock Countdown: Strictly applies ONLY when a video ad is filled & playable
  useEffect(() => {
    // Never lock if tier delay is 0, or if ad is not filled, or if video failed
    if (initialDelay <= 0 || adStatus !== 'filled' || videoError) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setCanSkip(true);
      onLockChange(false);
      return;
    }

    // Only filled revenue ads apply the mandatory 5-second countdown
    onLockChange(true);
    setCanSkip(false);
    setTimeLeft(initialDelay);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setCanSkip(true);
          onLockChange(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onLockChange(false);
    };
  }, [initialDelay, adStatus, videoError, onLockChange]);

  // VAST Tracking: Progress Beacons (25%, 50%, 75%)
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !adVideo?.trackingUrls || !video.duration) return;

    const percent = (video.currentTime / video.duration) * 100;
    const tracking = adVideo.trackingUrls;

    if (!quartileFiredRef.current.firstQuartile && percent >= 25) {
      quartileFiredRef.current.firstQuartile = true;
      fireTrackingBeacon(tracking.firstQuartile);
    }
    if (!quartileFiredRef.current.midpoint && percent >= 50) {
      quartileFiredRef.current.midpoint = true;
      fireTrackingBeacon(tracking.midpoint);
    }
    if (!quartileFiredRef.current.thirdQuartile && percent >= 75) {
      quartileFiredRef.current.thirdQuartile = true;
      fireTrackingBeacon(tracking.thirdQuartile);
    }
  }, [adVideo]);

  // VAST Tracking: Impression & Start
  const handlePlay = useCallback(() => {
    if (!quartileFiredRef.current.start && adVideo?.trackingUrls) {
      quartileFiredRef.current.start = true;
      fireTrackingBeacon(adVideo.trackingUrls.impressions);
      fireTrackingBeacon(adVideo.trackingUrls.start);
    }
  }, [adVideo]);

  // Natural End: Fires completion beacon, releases lock, advances feed
  const handleEnded = useCallback(() => {
    if (adVideo?.trackingUrls && !quartileFiredRef.current.complete) {
      quartileFiredRef.current.complete = true;
      fireTrackingBeacon(adVideo.trackingUrls.complete);
    }
    onLockChange(false);
    onNext();
  }, [adVideo, onLockChange, onNext]);

  // User Skip: Fires skip tracking beacon, advances feed
  const handleSkip = useCallback(() => {
    if (adVideo?.trackingUrls) {
      fireTrackingBeacon(adVideo.trackingUrls.skip);
    }
    onLockChange(false);
    onNext();
  }, [adVideo, onLockChange, onNext]);

  // Safe Click-Through CTA: Zero pop-unders, zero redirects
  const handleClickThrough = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (adVideo?.trackingUrls) {
        fireTrackingBeacon(adVideo.trackingUrls.clickTracking);
      }
      safeOpenClickThrough(adVideo?.clickThroughUrl);
    },
    [adVideo]
  );

  const handleVideoError = useCallback(() => {
    setVideoError(true);
    setAdStatus('error');
    setCanSkip(true);
    onLockChange(false);
  }, [onLockChange]);

  const progress = initialDelay > 0 ? ((initialDelay - timeLeft) / initialDelay) * 100 : 100;

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  };

  return (
    <div className="relative h-full w-full bg-black flex flex-col justify-between overflow-hidden select-none">
      {/* Background: In-stream video if available, otherwise native dark sponsored card */}
      {adVideo?.videoUrl && !videoError ? (
        <div className="absolute inset-0 z-0">
          <video
            ref={videoRef}
            src={adVideo.videoUrl}
            autoPlay
            playsInline
            muted={muted}
            onPlay={handlePlay}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleEnded}
            onError={handleVideoError}
            className="h-full w-full object-cover"
          />
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute top-20 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-transform active:scale-90"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#181818] via-[#121212] to-[#000000]" />
      )}

      {/* Top Banner: Sponsored Badge & Pro Upgrade Link */}
      <div
        className="relative z-10 flex items-center justify-between px-4"
        style={{
          paddingTop: 'max(4.25rem, calc(3.5rem + env(safe-area-inset-top, 0px)))',
        }}
      >
        <div className="flex items-center gap-2 rounded-full bg-[#1e1e1e]/85 px-3 py-1 ring-1 ring-white/10 backdrop-blur-md">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#9E9E9E]">
            Sponsored
          </span>
          <span className="text-xs text-white/50">•</span>
          <span className="text-xs text-white/70">
            {adVideo?.title || networkName}
          </span>
        </div>

        <button
          onClick={onUpgrade}
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:border-accent hover:text-accent"
        >
          <Crown className="h-3.5 w-3.5 text-accent" />
          <span>{tier === 'anonymous' ? 'Sign in' : 'Go Pro'}</span>
        </button>
      </div>

      {/* Center: Advertiser message or sponsor card (No lock icon on un-locked cards) */}
      <div className="relative z-10 mx-auto flex max-w-xs flex-col items-center px-4 text-center">
        {!adVideo?.videoUrl || videoError ? (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#181818] ring-1 ring-white/15">
              <span className="text-xs font-bold uppercase tracking-wider text-white/60">Ad</span>
            </div>
            <h2 className="text-lg font-bold text-white">Sponsored Reel</h2>
            <p className="mt-1 text-xs text-white/50 leading-relaxed">
              Experience lightning-fast streaming anywhere with Pulse. Upgrade to Pro for zero ads and full high-definition streaming.
            </p>
          </>
        ) : null}
      </div>

      {/* Bottom Controls: Skip Bar, Countdown Timer, and CTA */}
      <div
        className="relative z-10 w-full px-5 space-y-3"
        style={{
          paddingBottom: 'max(5.25rem, calc(4.5rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        {/* Learn More CTA (Opens safely in new tab, never pop-unders or redirects) */}
        {adVideo?.clickThroughUrl && (
          <button
            onClick={handleClickThrough}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/10 font-medium text-white backdrop-blur-md ring-1 ring-white/20 transition-all active:scale-[0.98] hover:bg-white/15"
          >
            <span>Learn More</span>
            <ExternalLink className="h-4 w-4 text-white/70" />
          </button>
        )}

        {/* 5-Second Skip Countdown for Filled Video Ads or Immediate Skip Button */}
        {!canSkip ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur-md">
            <div className="flex w-full items-center justify-between text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-white/40" />
                <span>Locked during ad</span>
              </span>
              <span className="font-semibold text-white/90">
                Skip in {timeLeft}s
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-accent transition-all duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={handleSkip}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white shadow-lg transition-transform active:scale-[0.98] hover:bg-accent-hover"
          >
            <SkipForward className="h-5 w-5" />
            <span>Skip Ad</span>
          </button>
        )}
      </div>
    </div>
  );
}
