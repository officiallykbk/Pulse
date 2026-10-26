import { useState, useEffect, useRef, useCallback } from 'react';
import { SkipForward, Crown, Lock, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import type { UserTier } from '@/types';
import { getSkipDelay, getVastEndpoint } from '@/services/exoclick';
import { fetchVastAd, type ParsedVastAd } from '@/services/vast';

export interface AdControllerProps {
  tier: UserTier;
  onNext: () => void;
  onUpgrade: () => void;
  onLockChange: (locked: boolean) => void;
  vastUrl?: string | null;
}

export function AdController({
  tier,
  onNext,
  onUpgrade,
  onLockChange,
  vastUrl,
}: AdControllerProps) {
  const initialDelay = getSkipDelay(tier);
  const [canSkip, setCanSkip] = useState(initialDelay <= 0);
  const [timeLeft, setTimeLeft] = useState(initialDelay);
  const [adVideo, setAdVideo] = useState<ParsedVastAd | null>(null);
  const [muted, setMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Fetch VAST in-stream video ad if endpoint configured
  useEffect(() => {
    let cancelled = false;
    const endpoint = vastUrl !== undefined ? vastUrl : getVastEndpoint();

    if (!endpoint) {
      return;
    }

    fetchVastAd(endpoint).then((ad) => {
      if (cancelled) return;
      if (ad && ad.videoUrl) {
        setAdVideo(ad);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [vastUrl]);

  // 2. 5-Second Skip Lock Timer
  useEffect(() => {
    if (initialDelay <= 0) {
      setCanSkip(true);
      onLockChange(false);
      return;
    }

    onLockChange(true);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setCanSkip(true);
          onLockChange(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      onLockChange(false);
    };
  }, [initialDelay, onLockChange]);

  // Fallback auto-skip if a video fails to play and user can skip
  const handleVideoError = useCallback(() => {
    setVideoError(true);
  }, []);

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
            onEnded={onNext}
            onError={handleVideoError}
            className="h-full w-full object-cover"
          />
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="absolute top-20 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-[#181818] via-[#121212] to-[#000000]" />
      )}

      {/* Top Banner: Sponsored Badge & Pro Upgrade Link */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-16">
        <div className="flex items-center gap-2 rounded-full bg-[#1e1e1e]/85 px-3 py-1 ring-1 ring-white/10 backdrop-blur-md">
          <span className="text-[10px] font-bold tracking-wider uppercase text-[#9E9E9E]">
            Sponsored
          </span>
          <span className="text-xs text-white/50">•</span>
          <span className="text-xs text-white/70">
            {adVideo?.title || 'Pulse Partner'}
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

      {/* Center: Advertiser message or sponsor card */}
      <div className="relative z-10 mx-auto flex max-w-xs flex-col items-center px-4 text-center">
        {!adVideo?.videoUrl || videoError ? (
          <>
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#181818] ring-1 ring-white/15">
              {canSkip ? (
                <span className="text-xs font-bold uppercase tracking-wider text-white/60">Ad</span>
              ) : (
                <Lock className="h-6 w-6 text-white/60" />
              )}
            </div>
            <h2 className="text-lg font-bold text-white">Sponsored Reel</h2>
            <p className="mt-1 text-xs text-white/50 leading-relaxed">
              Experience lightning-fast streaming anywhere with Pulse. Upgrade to Pro for zero ads and full high-definition streaming.
            </p>
          </>
        ) : null}
      </div>

      {/* Bottom Controls: Skip Bar, Countdown Timer, and CTA */}
      <div className="relative z-10 w-full px-5 pb-20 space-y-3">
        {/* Learn More CTA (Opens safely in new tab, never pop-unders) */}
        {adVideo?.clickThroughUrl && (
          <a
            href={adVideo.clickThroughUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white/10 font-medium text-white backdrop-blur-md ring-1 ring-white/20 transition-all active:scale-[0.98]"
          >
            <span>Learn More</span>
            <ExternalLink className="h-4 w-4 text-white/70" />
          </a>
        )}

        {/* 5-Second Skip Countdown or Active Skip Button */}
        {!canSkip ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-black/60 p-3 ring-1 ring-white/10 backdrop-blur-md">
            <div className="flex w-full items-center justify-between text-xs text-white/60">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-white/40" />
                <span>Swipe locked during ad</span>
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
            onClick={onNext}
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
