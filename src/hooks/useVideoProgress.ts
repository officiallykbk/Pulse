import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { supabase } from '@/services/supabase';
import { loadAppSettings } from '@/lib/settings';

const RESUME_KEY = 'pulse:resume-position:';
const RESUME_THRESHOLD_SECONDS = 8;
const LOCAL_CHECKPOINT_SECONDS = 5;
const REMOTE_CHECKPOINT_INTERVAL_MS = 30_000;

function localKey(videoId: string, userId: string | null): string {
  return RESUME_KEY + (userId ?? 'guest') + ':' + videoId;
}

function legacyLocalKey(videoId: string): string {
  return RESUME_KEY + videoId;
}

export function useVideoProgress(
  videoId: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
) {
  const userIdRef = useRef<string | null>(null);
  const progressDirtyRef = useRef(false);
  const totalSessionSecondsRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastRemoteCheckpointAtRef = useRef(0);
  const lastPositionRef = useRef(0);
  const lastLocalPositionRef = useRef(0);
  const insightsAllowedRef = useRef(false);
  const insightSentRef = useRef(false);
  const completedRef = useRef(false);
  const pendingResumeRef = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;

    let alive = true;
    userIdRef.current = null;
    progressDirtyRef.current = false;
    totalSessionSecondsRef.current = 0;
    lastRemoteCheckpointAtRef.current = Date.now();
    lastTimeRef.current = video.currentTime || 0;
    lastPositionRef.current = Math.floor(video.currentTime || 0);
    lastLocalPositionRef.current = lastPositionRef.current;
    insightsAllowedRef.current = loadAppSettings().viewingInsights;
    insightSentRef.current = false;
    completedRef.current = false;
    pendingResumeRef.current = 0;

    const applyResume = () => {
      const target = pendingResumeRef.current;
      if (target >= RESUME_THRESHOLD_SECONDS && video.duration > target + 3 && video.currentTime < target - 3) {
        try { video.currentTime = target; } catch { /* wait for media to become seekable */ }
      }
    };

    const persistLocalPosition = (position: number, completed: boolean) => {
      try {
        const key = localKey(videoId, userIdRef.current);
        if (completed || position < RESUME_THRESHOLD_SECONDS) localStorage.removeItem(key);
        else localStorage.setItem(key, String(Math.floor(position)));
        localStorage.removeItem(legacyLocalKey(videoId));
      } catch { /* Storage may be unavailable. */ }
    };

    const flushInsight = async (completed: boolean, skipped: boolean) => {
      const userId = userIdRef.current;
      const watchedSeconds = Math.min(600, Math.floor(totalSessionSecondsRef.current));
      if (!userId || !insightsAllowedRef.current || insightSentRef.current || watchedSeconds < 1) return;

      insightSentRef.current = true;
      try {
        await supabase.rpc('record_video_viewing_insight', {
          target_video_id: videoId,
          session_watched_seconds: watchedSeconds,
          did_complete: completed,
          did_skip: skipped,
        });
      } catch {
        // Optional aggregate telemetry must never interrupt playback.
      }
    };

    const checkpoint = async (completed = false, force = false) => {
      const position = Math.max(0, Math.floor(video.currentTime || 0));
      lastPositionRef.current = position;
      persistLocalPosition(position, completed);

      const now = Date.now();
      if (
        !userIdRef.current
        || (!progressDirtyRef.current && !completed)
        || (!force && !completed && now - lastRemoteCheckpointAtRef.current < REMOTE_CHECKPOINT_INTERVAL_MS)
      ) return;

      progressDirtyRef.current = false;
      lastRemoteCheckpointAtRef.current = now;
      try {
        await supabase.rpc('save_video_watch_progress', {
          target_video_id: videoId,
          position_seconds: position,
          did_complete: completed,
        });
      } catch {
        // The local continuity checkpoint remains available if the network fails.
      }
    };

    const markCompleted = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      void checkpoint(true, true);
      void flushInsight(true, false);
    };

    const onTimeUpdate = () => {
      const current = video.currentTime || 0;
      const delta = current - lastTimeRef.current;
      if (delta > 0 && delta <= 2.5) {
        progressDirtyRef.current = true;
        totalSessionSecondsRef.current = Math.min(600, totalSessionSecondsRef.current + delta);
      }
      lastTimeRef.current = current;

      const position = Math.max(0, Math.floor(current));
      lastPositionRef.current = position;
      if (position - lastLocalPositionRef.current >= LOCAL_CHECKPOINT_SECONDS) {
        persistLocalPosition(position, false);
        lastLocalPositionRef.current = position;
      }
      if (Date.now() - lastRemoteCheckpointAtRef.current >= REMOTE_CHECKPOINT_INTERVAL_MS) {
        void checkpoint();
      }
      if (video.duration > 0 && current >= video.duration - 1) markCompleted();
    };

    const onPlay = () => { lastTimeRef.current = video.currentTime || 0; };
    const onPause = () => { void checkpoint(false, true); };
    const onEnded = () => { markCompleted(); };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void checkpoint(false, true);
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      userIdRef.current = session?.user.id ?? null;
    });

    video.addEventListener('loadedmetadata', applyResume);
    video.addEventListener('durationchange', applyResume);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    document.addEventListener('visibilitychange', onVisibilityChange);

    void (async () => {
      let resume = 0;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;
        userIdRef.current = user?.id ?? null;
        if (user) {
          const { data: progress } = await supabase.from('video_watch_progress')
            .select('last_position_seconds, completed')
            .eq('user_id', user.id)
            .eq('video_id', videoId)
            .maybeSingle();
          if (!alive) return;
          insightsAllowedRef.current = loadAppSettings().viewingInsights;
          if (progress && !progress.completed && progress.last_position_seconds >= RESUME_THRESHOLD_SECONDS) {
            resume = progress.last_position_seconds;
          }
        }
      } catch {
        // Use the local fallback below.
      }
      if (!resume) {
        try {
          resume = Number(
            localStorage.getItem(localKey(videoId, userIdRef.current))
            ?? localStorage.getItem(legacyLocalKey(videoId))
            ?? 0
          );
        } catch {
          // Local storage may be unavailable.
        }
      }
      if (!alive) return;
      pendingResumeRef.current = resume;
      if (video.readyState >= 1) applyResume();
    })();

    return () => {
      alive = false;
      video.removeEventListener('loadedmetadata', applyResume);
      video.removeEventListener('durationchange', applyResume);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      subscription.unsubscribe();

      const completed = completedRef.current
        || (video.duration > 0 && lastPositionRef.current >= video.duration - 1);
      const skipped = !completed
        && totalSessionSecondsRef.current < 3
        && lastPositionRef.current < Math.max(0, video.duration - 5);
      void checkpoint(completed, true);
      void flushInsight(completed, skipped);
    };
  }, [enabled, videoId, videoRef]);
}
