import { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Play } from 'lucide-react';

import { feedActions } from '@/lib/feedActions';
import { useSoundState } from '@/hooks/useSoundState';
import { useVideoProgress } from '@/hooks/useVideoProgress';
import { loadAppSettings } from '@/lib/settings';

export type PlayerSlotState = 'active' | 'prefetch' | 'paused' | 'idle';

interface VideoPlayerProps {
  videoId: string;
  videoUrl: string;
  posterUrl?: string | null;
  isActive?: boolean;
  slotState?: PlayerSlotState;
}

export function VideoPlayer({
  videoId,
  videoUrl,
  posterUrl,
  isActive = false,
  slotState: explicitSlotState,
}: VideoPlayerProps) {
  const slotState: PlayerSlotState = explicitSlotState ?? (isActive ? 'active' : 'idle');
  const { isMuted, toggleMute } = useSoundState();

  const videoRef = useRef<HTMLVideoElement>(null);
  useVideoProgress(videoId, videoRef, slotState === 'active');
  const hlsRef = useRef<Hls | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  // Sync video element mute state with global sound manager
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
  }, [isMuted]);

  // Manage HLS / Media attachment across the sliding window states
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Slot: IDLE -> Complete teardown & memory release
    if (slotState === 'idle') {
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsLoaded(false);
      setProgress(0);
      return;
    }

    // Slot: PAUSED -> Keep current frame rendered, stop loading new fragments
    if (slotState === 'paused') {
      video.pause();
      if (hlsRef.current) {
        hlsRef.current.stopLoad();
      }
      return;
    }

    // Slot: PREFETCH -> Initialize buffer with 2s chunk at lowest level, keep paused
    if (slotState === 'prefetch') {
      setError(false);
      if (videoUrl.includes('.m3u8') && Hls.isSupported()) {
        if (!hlsRef.current) {
          const hls = new Hls({
            maxBufferLength: 2,
            maxMaxBufferLength: 4,
            startLevel: 0, // lowest bitrate in ladder (240p/360p) for quick prefetch
            autoStartLoad: true,
            capLevelToPlayerSize: true,
          });
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoaded(true);
            video.muted = true;
            video.pause();
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setError(true);
          });
        }
      } else {
        video.preload = 'auto';
        if (video.src !== videoUrl) {
          video.src = videoUrl;
        }
        video.muted = true;
        video.pause();
      }
      return;
    }

    // Slot: ACTIVE -> Play immediately, upgrade buffer if needed
    if (slotState === 'active') {
      setError(false);
      const appSettings = loadAppSettings();
      if (videoUrl.includes('.m3u8') && Hls.isSupported()) {
        if (!hlsRef.current) {
          const hls = new Hls({
            maxBufferLength: appSettings.dataSaver ? 2 : 8,
            maxMaxBufferLength: appSettings.dataSaver ? 4 : 15,
            capLevelToPlayerSize: true,
            startLevel: appSettings.dataSaver ? 0 : -1,
          });
          hls.autoLevelCapping = appSettings.dataSaver ? 0 : -1;
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            setIsLoaded(true);
            video.muted = isMuted;
            if (appSettings.autoplay) {
              video.play().catch(() => {});
            } else {
              setPaused(true);
            }
          });
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setError(true);
          });
        } else {
          // Resuming from prefetch or paused
          hlsRef.current.startLoad();
          video.muted = isMuted;
          if (appSettings.autoplay) {
            video.play().catch(() => {});
          } else {
            setPaused(true);
          }
          setIsLoaded(true);
        }
      } else {
        if (video.src !== videoUrl) {
          video.src = videoUrl;
          video.onloadeddata = () => {
            setIsLoaded(true);
            video.muted = isMuted;
            if (appSettings.autoplay) {
              video.play()?.catch(() => {});
            } else {
              setPaused(true);
            }
          };
          video.onerror = () => setError(true);
        } else {
          video.muted = isMuted;
          if (appSettings.autoplay) {
            video.play()?.catch(() => {});
          } else {
            setPaused(true);
          }
          setIsLoaded(true);
        }
      }
    }

    return () => {
      // Cleanup when unmounting or transitioning slot
      if (hlsRef.current && (slotState as PlayerSlotState) === 'idle') {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [slotState, videoUrl, isMuted]);

  // Handle play/pause, timeupdate, and progress for active player
  useEffect(() => {
    const video = videoRef.current;
    if (!video || slotState !== 'active') return;

    const onTimeUpdate = () => {
      if (video.duration > 0) {
        setProgress((video.currentTime / video.duration) * 100);
      }
    };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
    };
  }, [slotState, isLoaded]);

  // Keyboard controls for active video
  useEffect(() => {
    if (slotState !== 'active') return;
    return feedActions.on('play-pause', () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [slotState]);

  const togglePause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <p className="text-sm text-white/60">Video unavailable</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-black">
      {!isLoaded && slotState !== 'idle' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      )}

      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        loop
        preload={slotState === 'idle' ? 'none' : 'auto'}
        poster={posterUrl ?? undefined}
        onClick={togglePause}
      />

      {paused && isLoaded && slotState === 'active' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
            <Play className="h-8 w-8 fill-white text-white" />
          </div>
        </div>
      )}

      {slotState === 'active' && (
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          className="absolute right-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors active:bg-black/60"
        >
          {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
        </button>
      )}

      {slotState === 'active' && (
        <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] md:bottom-0 left-0 right-0 z-20 h-0.5 bg-white/10">
          <div
            className="h-full bg-accent transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
