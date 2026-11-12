import { useRef, useState, useCallback, useEffect } from 'react';
import { VideoPlayer, type PlayerSlotState } from '@/components/VideoPlayer';
import { VideoOptionsSheet } from '@/components/VideoOptionsSheet';
import { CommentsSheet } from '@/components/CommentsSheet';
import { GeneratedAvatar } from '@/components/GeneratedAvatar';
import { AgeGateModal } from '@/components/AgeGateModal';
import { TrustConversionModal, type AuthIntent } from '@/components/TrustConversionModal';
import { Bookmark, Check, Heart, MessageCircle, Plus, Send, Volume2, VolumeX } from 'lucide-react';
import { useLikes } from '@/hooks/useLikes';
import { useFollow } from '@/hooks/useFollow';
import { useSoundState } from '@/hooks/useSoundState';
import { feedActions } from '@/lib/feedActions';
import { supabase } from '@/services/supabase';
import { submitReport } from '@/services/reportService';
import { ageVerificationService } from '@/services/ageVerification';
import { anonymousState } from '@/lib/anonymousState';
import { APP_IDENTITY } from '@/config/appIdentity';
import type { Video, UserTier } from '@/types';
import { toast } from 'sonner';

interface VideoCardProps {
  video: Video;
  isActive: boolean;
  slotState?: PlayerSlotState;
  tier: UserTier;
  onRequireAuth: () => void;
  shareUrl?: string;
}

export function VideoCard({ video, isActive, slotState, tier, onRequireAuth, shareUrl }: VideoCardProps) {
  const { liked, likeCount, toggleLike } = useLikes(video.id, video.like_count);
  const { following, busy, toggleFollow } = useFollow(video.uploader_id);
  const { isMuted, toggleMute } = useSoundState();
  const [showHeart, setShowHeart] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(video.comment_count);
  const [shareCount, setShareCount] = useState(video.share_count);
  const [saved, setSaved] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewedRef = useRef(false);

  const isRestricted = video.visibility === 'age_restricted';
  const [ageVerified, setAgeVerified] = useState(() => ageVerificationService.getSnapshot() === 'verified');
  const [ageModalOpen, setAgeModalOpen] = useState(false);
  const [conversionModalOpen, setConversionModalOpen] = useState(false);
  const [conversionIntent, setConversionIntent] = useState<AuthIntent>('default');
  const [playableUrls, setPlayableUrls] = useState({
    videoUrl: video.video_url,
    posterUrl: video.thumbnail_url,
  });

  useEffect(() => {
    return ageVerificationService.subscribe(() => {
      setAgeVerified(ageVerificationService.getSnapshot() === 'verified');
    });
  }, []);

  useEffect(() => {
    if (isRestricted && isActive) {
      if (ageVerificationService.getSnapshot() === 'unknown') {
        void ageVerificationService.status().then((status) => {
          setAgeVerified(status === 'verified');
        });
      }
    }
  }, [isRestricted, isActive]);

  useEffect(() => {
    setPlayableUrls({
      videoUrl: video.video_url,
      posterUrl: video.thumbnail_url,
    });

    if (isRestricted && ageVerified) {
      void fetch(`/api/media/restricted/${video.id}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.video_url) {
            setPlayableUrls({
              videoUrl: data.video_url,
              posterUrl: data.thumbnail_url || video.thumbnail_url,
            });
          }
        })
        .catch(() => {});
    }
  }, [isRestricted, ageVerified, video.id, video.video_url, video.thumbnail_url]);

  useEffect(() => {
    setCommentCount(video.comment_count);
    setShareCount(video.share_count);
    setCaptionExpanded(false);
  }, [video.id, video.comment_count, video.share_count]);

  useEffect(() => {
    let active = true;
    if (!isActive) return () => { active = false; };
    if (tier === 'anonymous') {
      setSaved(anonymousState.isSaved(video.id));
      const unsubscribe = anonymousState.subscribe(() => {
        if (active) setSaved(anonymousState.isSaved(video.id));
      });
      return () => {
        active = false;
        unsubscribe();
      };
    }
    setSaved(false);
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('saved_videos')
        .select('video_id').eq('user_id', user.id).eq('video_id', video.id).maybeSingle();
      if (active) setSaved(Boolean(data));
    }).catch(() => {});
    return () => { active = false; };
  }, [isActive, tier, video.id]);

  const handleSaveVideo = useCallback(async () => {
    if (tier === 'anonymous') {
      const res = anonymousState.toggleSaved(video.id);
      if (res.limitReached) {
        setConversionIntent('save-limit');
        setConversionModalOpen(true);
        onRequireAuth();
        return;
      }
      setSaved(res.saved);
      toast(res.saved ? 'Saved for 24h on this device' : 'Removed from Saved');
      return;
    }
    if (savingVideo) return;
    setSavingVideo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        onRequireAuth();
        return;
      }
      if (saved) {
        const { error } = await supabase.from('saved_videos').delete()
          .eq('user_id', user.id).eq('video_id', video.id);
        if (error) throw error;
        setSaved(false);
        toast('Removed from Saved');
      } else {
        const { error } = await supabase.from('saved_videos').insert({ user_id: user.id, video_id: video.id });
        if (error) throw error;
        setSaved(true);
        toast.success('Saved for later');
      }
    } catch {
      toast.error('Could not update Saved. Try again.');
    } finally {
      setSavingVideo(false);
    }
  }, [tier, onRequireAuth, savingVideo, saved, video.id]);

  const handleMuteClick = useCallback(() => {
    const nextMuted = toggleMute();
    toast(nextMuted ? 'Sound off' : 'Sound on');
  }, [toggleMute]);

  useEffect(() => {
    if (tier !== 'anonymous' && isActive && !viewedRef.current) {
      viewedRef.current = true;
      supabase.rpc('increment_view_count', { video_id: video.id }).then(() => {});
    }
    if (!isActive) {
      viewedRef.current = false;
    }
  }, [isActive, tier, video.id]);

  const handleDoubleTap = useCallback(() => {
    if (tier === 'anonymous') {
      onRequireAuth();
      return;
    }
    if (!liked) {
      toggleLike();
      toast.success('Added to your liked videos');
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  }, [liked, toggleLike, tier, onRequireAuth]);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      handleDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      tapTimerRef.current = setTimeout(() => {
        feedActions.emit('play-pause');
        lastTapRef.current = 0;
        tapTimerRef.current = null;
      }, 300);
    }
  }, [handleDoubleTap]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    };
  }, []);

  const handleLikeClick = useCallback(() => {
    if (tier === 'anonymous') {
      onRequireAuth();
      return;
    }
    const wasLiked = liked;
    toggleLike();
    if (wasLiked) {
      toast('Removed from liked videos');
    } else {
      toast.success('Added to your liked videos');
    }
  }, [tier, toggleLike, onRequireAuth, liked]);

  const handleShare = useCallback(async () => {
    const videoShareUrl = shareUrl ?? new URL(`/watch/${video.id}`, window.location.origin).toString();
    const shareData = {
      title: video.title,
      text: APP_IDENTITY.share.buildVideoShareText(video.description),
      url: videoShareUrl,
    };

    let shared = false;
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        shared = true;
      } catch {
        // User cancelled share
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareData.url);
        shared = true;
      } catch {
        // Clipboard not available
      }
    }

    if (shared) {
      if (tier !== 'anonymous') {
        supabase.rpc('increment_share_count', { video_id: video.id }).then(() => {});
      }
      setShareCount((count) => count + 1);
      toast.success(typeof navigator.share === 'function' ? 'Shared!' : 'Link copied to clipboard');
    }
  }, [video.title, video.description, video.id, shareUrl, tier]);

  const handleReport = useCallback(async (reason: string) => {
    const result = await submitReport({
      videoId: video.id,
      reason,
    });
    if (!result.success) {
      toast.error(result.error || "Eish, that didn't go through. Try again?");
    } else {
      toast.success(result.message || 'Report submitted. Thank you.');
    }
  }, [video.id]);

  const handleCommentClick = useCallback(() => {
    if (tier === 'anonymous') {
      onRequireAuth();
      return;
    }
    setCommentsOpen(true);
  }, [tier, onRequireAuth]);

  const handleFollowClick = useCallback(async () => {
    if (tier === 'anonymous') {
      onRequireAuth();
      return;
    }
    const { error } = await toggleFollow();
    if (!error) {
      toast.success(following ? 'Unfollowed creator' : 'Following creator!');
    }
  }, [tier, onRequireAuth, toggleFollow, following]);

  useEffect(() => {
    if (!isActive) return;
    return feedActions.on('like', () => {
      handleLikeClick();
    });
  }, [isActive, handleLikeClick]);

  useEffect(() => {
    if (!isActive) return;
    return feedActions.on('comments', () => {
      handleCommentClick();
    });
  }, [isActive, handleCommentClick]);

  useEffect(() => {
    if (!isActive) return;
    return feedActions.on('share', () => {
      void handleShare();
    });
  }, [isActive, handleShare]);

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.0', '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.0', '')}K`;
    return String(n);
  };

  const creatorName = video.uploader?.display_name || 'creator';
  const captionText = [video.title, video.description].filter(Boolean).join(' ');
  const captionCanExpand = captionText.length > 88;
  const actionButtonClass = 'video-action-button group flex min-h-12 w-12 flex-col items-center justify-center gap-0.5 text-white active:scale-90 disabled:opacity-50';
  const actionIconClass = 'video-action-icon h-8 w-8 transition-transform group-active:scale-90 [filter:drop-shadow(0_1px_3px_rgba(0,0,0,0.95))]';
  const actionCountClass = 'video-action-count min-h-3.5 text-[11px] font-semibold leading-3.5 text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]';

  return (
    <div className="absolute inset-0">
      <VideoPlayer
        videoId={video.id}
        videoUrl={playableUrls.videoUrl}
        posterUrl={playableUrls.posterUrl}
        isActive={isActive && (!isRestricted || ageVerified)}
        slotState={slotState}
      />

      {isRestricted && !ageVerified && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 bg-black/85 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-4">
            <span className="text-xl font-bold">18+</span>
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Age-Restricted Content</h3>
          <p className="text-xs text-neutral-400 max-w-xs mb-6">
            This video is marked as 18+ Only. Confirm your age with our privacy-first declaration to watch.
          </p>
          <button
            onClick={() => setAgeModalOpen(true)}
            className="px-6 py-2.5 rounded-full bg-[#E50914] hover:bg-[#B80710] font-semibold text-white text-sm transition-colors shadow-lg active:scale-95"
          >
            Confirm Age (18+)
          </button>
        </div>
      )}

      <div className="absolute inset-0 z-10" onClick={handleTap} data-testid="video-tap-surface" />

      <div className="pointer-events-none absolute inset-0 z-[15] bg-gradient-to-t from-black/70 via-transparent to-black/20" />

      {showHeart && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <Heart
            className="h-24 w-24 fill-accent text-accent"
            style={{ animation: 'heartPop 0.8s ease-out' }}
          />
        </div>
      )}

      <div
        className={`video-caption absolute left-0 right-0 z-20 px-4 pb-1 pr-18 sm:pr-20 ${captionExpanded ? 'is-expanded' : ''}`}
      >
        <div className="mb-1.5 text-sm font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
          @{creatorName}
        </div>
        <h2 className={`video-caption-copy text-[15px] leading-snug text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.95)] sm:text-base ${captionExpanded ? '' : 'line-clamp-2'}`}>
          <span className="font-semibold">{video.title}</span>
          {video.description && <span className="font-normal text-white/85"> {video.description}</span>}
        </h2>
        {captionCanExpand && (
          <button
            type="button"
            onClick={() => setCaptionExpanded((expanded) => !expanded)}
            aria-expanded={captionExpanded}
            className="mt-1 min-h-8 rounded-full pr-3 text-xs font-semibold text-white/75 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]"
          >
            {captionExpanded ? 'Show less' : 'More'}
          </button>
        )}
      </div>

      <div
        className="video-action-rail absolute right-1.5 z-20 flex flex-col items-center gap-1.5 sm:right-2 sm:gap-2"
        aria-label="Video actions"
      >
        {video.uploader_id ? (
          <button
            onClick={handleFollowClick}
            disabled={busy}
            aria-label={following ? `Unfollow @${creatorName}` : `Follow @${creatorName}`}
            className="video-creator-action group relative mb-1 flex h-14 w-14 items-center justify-center active:scale-95 disabled:opacity-60"
          >
            {video.uploader?.avatar_url ? (
              <img
                src={video.uploader.avatar_url}
                alt=""
                className="video-creator-avatar h-12 w-12 rounded-full border border-white/70 object-cover shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
              />
            ) : (
              <GeneratedAvatar
                name={video.uploader?.display_name || 'Pulse creator'}
                className="video-creator-avatar h-12 w-12 border border-white/70 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
              />
            )}
            <span className={`absolute bottom-0 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 border-black text-white shadow-md ${following ? 'bg-white' : 'bg-accent'}`}>
              {following ? <Check className="h-3 w-3 text-black" strokeWidth={3} /> : <Plus className="h-3 w-3" strokeWidth={3} />}
            </span>
          </button>
        ) : (
          <div className="mb-1 flex h-14 w-14 items-center justify-center" aria-label={`@${creatorName}`}>
            <GeneratedAvatar
              name={video.uploader?.display_name || 'Pulse creator'}
              className="h-12 w-12 border border-white/70 text-xs shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
            />
          </div>
        )}

        <button
          onClick={handleLikeClick}
          aria-label={liked ? `Unlike video, ${formatCount(likeCount)} likes` : `Like video, ${formatCount(likeCount)} likes`}
          className={actionButtonClass}
        >
          <Heart className={`${actionIconClass} ${liked ? 'scale-110 fill-accent text-accent' : 'text-white'}`} strokeWidth={2.1} />
          <span className={actionCountClass}>{formatCount(likeCount)}</span>
        </button>

        <button
          onClick={handleCommentClick}
          aria-label={`Open comments, ${formatCount(commentCount)} comments`}
          className={actionButtonClass}
        >
          <MessageCircle className={`${actionIconClass} fill-white text-white`} strokeWidth={1.8} />
          <span className={actionCountClass}>{formatCount(commentCount)}</span>
        </button>

        <button
          onClick={() => void handleSaveVideo()}
          disabled={savingVideo}
          aria-label={saved ? 'Remove from Saved' : 'Save video'}
          aria-pressed={saved}
          className={actionButtonClass}
        >
          <Bookmark className={`${actionIconClass} ${saved ? 'fill-white text-white' : 'text-white'}`} strokeWidth={2} />
          <span className={actionCountClass}>{saved ? 'Saved' : 'Save'}</span>
        </button>

        <button
          onClick={() => setOptionsOpen(true)}
          aria-label={`Share video, ${formatCount(shareCount)} shares`}
          className={actionButtonClass}
        >
          <Send className={`${actionIconClass} fill-white text-white`} strokeWidth={1.8} />
          <span className={actionCountClass}>{formatCount(shareCount)}</span>
        </button>
      </div>

      <div
        className="video-mute absolute right-3.5 z-50"
      >
        <button
          onClick={handleMuteClick}
          data-testid="mute-toggle-btn"
          aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
          className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-90 ${
            isMuted
              ? 'border-white/15 bg-black/45 text-white hover:bg-black/65'
              : 'border-white bg-white text-black'
          }`}
        >
          {isMuted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
          <span className="sr-only">{isMuted ? 'Muted' : 'Sound'}</span>
        </button>
      </div>

      <VideoOptionsSheet
        video={video}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        saved={saved}
        saving={savingVideo}
        shareCount={shareCount}
        shareUrl={shareUrl ?? new URL(`/watch/${video.id}`, window.location.origin).toString()}
        onSave={() => void handleSaveVideo()}
        onShare={handleShare}
        onReport={handleReport}
      />

      <CommentsSheet
        videoId={video.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentCountChange={(delta) => setCommentCount((count) => Math.max(0, count + delta))}
      />

      <AgeGateModal
        open={ageModalOpen}
        onClose={() => setAgeModalOpen(false)}
        onVerified={() => setAgeVerified(true)}
        contentTitle={video.title}
      />

      <TrustConversionModal
        open={conversionModalOpen}
        intent={conversionIntent}
        onClose={() => setConversionModalOpen(false)}
        onContinueToAuth={() => onRequireAuth()}
      />
    </div>
  );
}
