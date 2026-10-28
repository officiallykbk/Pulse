import { useRef, useState, useCallback, useEffect } from 'react';
import { VideoPlayer, type PlayerSlotState } from '@/components/VideoPlayer';
import { VideoOptionsSheet } from '@/components/VideoOptionsSheet';
import { CommentsSheet } from '@/components/CommentsSheet';
import { GeneratedAvatar } from '@/components/GeneratedAvatar';
import { Bookmark, Heart, Share2, MoreVertical, Volume2, VolumeX, MessageCircle, UserPlus, UserCheck } from 'lucide-react';
import { useLikes } from '@/hooks/useLikes';
import { useFollow } from '@/hooks/useFollow';
import { useSoundState } from '@/hooks/useSoundState';
import { feedActions } from '@/lib/feedActions';
import { supabase } from '@/services/supabase';
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
  const [saved, setSaved] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const lastTapRef = useRef(0);
  const viewedRef = useRef(false);

  useEffect(() => {
    setCommentCount(video.comment_count);
  }, [video.id, video.comment_count]);

  useEffect(() => {
    let active = true;
    setSaved(false);
    if (!isActive || tier === 'anonymous') return () => { active = false; };
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
      onRequireAuth();
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
    if (isActive && !viewedRef.current) {
      viewedRef.current = true;
      supabase.rpc('increment_view_count', { video_id: video.id }).then(() => {});
    }
    if (!isActive) {
      viewedRef.current = false;
    }
  }, [isActive, video.id]);

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
      handleDoubleTap();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [handleDoubleTap]);

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
      supabase.rpc('increment_share_count', { video_id: video.id }).then(() => {});
      toast.success(typeof navigator.share === 'function' ? 'Shared!' : 'Link copied to clipboard');
    }
  }, [video.title, video.description, video.id, shareUrl]);

  const handleReport = useCallback(async (reason: string) => {
    if (tier === 'anonymous') {
      onRequireAuth();
      return;
    }
    const { error } = await supabase.from('reports').insert({
      video_id: video.id,
      reason,
    });
    if (error) {
      toast.error("Eish, that didn't go through. Try again?");
    } else {
      toast.success('Report submitted. Thank you.');
    }
  }, [video.id, tier, onRequireAuth]);

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
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="absolute inset-0">
      <VideoPlayer
        videoId={video.id}
        videoUrl={video.video_url}
        posterUrl={video.thumbnail_url}
        isActive={isActive}
        slotState={slotState}
      />

      <div className="absolute inset-0 z-10" onClick={handleTap} />

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
        className="absolute left-0 right-0 z-20 px-4 pb-1 pr-18 sm:pr-20"
        style={{
          bottom: 'max(4.25rem, calc(3.75rem + env(safe-area-inset-bottom, 0px)))',
          paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          {video.uploader?.avatar_url ? (
            <img
              src={video.uploader.avatar_url}
              alt={video.uploader.display_name || 'Creator avatar'}
              className="h-7 w-7 rounded-full object-cover ring-1 ring-white/20"
            />
          ) : (
            <GeneratedAvatar
              name={video.uploader?.display_name || 'Pulse creator'}
              className="h-7 w-7 text-[10px] ring-1 ring-white/20"
            />
          )}
          <span className="text-xs font-semibold text-white drop-shadow-sm">
            @{video.uploader?.display_name || 'creator'}
          </span>
        </div>
        <h2 className="mb-1 text-sm sm:text-base font-semibold text-white line-clamp-1">{video.title}</h2>
        {video.description && (
          <p className="line-clamp-2 text-xs sm:text-sm text-white/70 leading-snug">{video.description}</p>
        )}
      </div>

      <div
        className="absolute right-2 sm:right-3 z-20 flex flex-col items-center gap-2.5 sm:gap-3.5"
        style={{
          bottom: 'max(4.25rem, calc(3.75rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        {video.uploader_id && (
          <button onClick={handleFollowClick} disabled={busy} className="flex flex-col items-center gap-1">
            <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-90 ${following ? 'bg-accent/20' : 'bg-white/10'}`}>
              {following
                ? <UserCheck className="h-5 w-5 text-accent" />
                : <UserPlus className="h-5 w-5 text-white" />}
            </div>
            <span className="text-[11px] font-medium text-white/80">{following ? 'Following' : 'Follow'}</span>
          </button>
        )}
        <button onClick={handleLikeClick} className="flex flex-col items-center gap-1">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-90 ${liked ? 'bg-accent/20' : 'bg-white/10'}`}>
            <Heart className={`h-5 w-5 transition-all ${liked ? 'fill-accent text-accent scale-110' : 'text-white'}`} />
          </div>
          <span className="text-[11px] font-medium text-white/80">{formatCount(likeCount)}</span>
        </button>

        <button onClick={handleCommentClick} className="flex flex-col items-center gap-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-transform active:scale-90">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <span className="text-[11px] font-medium text-white/80">{formatCount(commentCount)}</span>
        </button>

        <button
          onClick={() => void handleSaveVideo()}
          disabled={savingVideo}
          aria-label={saved ? 'Remove from Saved' : 'Save video'}
          className="flex flex-col items-center gap-1 disabled:opacity-50"
        >
          <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-transform active:scale-90 ${saved ? 'bg-accent/20' : 'bg-white/10'}`}>
            <Bookmark className={`h-5 w-5 ${saved ? 'fill-accent text-accent' : 'text-white'}`} />
          </div>
          <span className="text-[11px] font-medium text-white/80">{saved ? 'Saved' : 'Save'}</span>
        </button>

        <button
          onClick={handleMuteClick}
          data-testid="mute-toggle-btn"
          aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
          className="flex flex-col items-center gap-1"
        >
          <div className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition-all active:scale-90 ${isMuted ? 'bg-white/10' : 'bg-accent/20'}`}>
            {isMuted ? (
              <VolumeX className="h-5 w-5 text-white/90" />
            ) : (
              <Volume2 className="h-5 w-5 text-accent" />
            )}
          </div>
          <span className={`text-[11px] font-medium ${isMuted ? 'text-white/80' : 'text-accent font-semibold'}`}>
            {isMuted ? 'Muted' : 'Sound'}
          </span>
        </button>

        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-transform active:scale-90">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-[11px] font-medium text-white/80">{formatCount(video.share_count)}</span>
        </button>

        <button onClick={() => setOptionsOpen(true)} className="flex flex-col items-center gap-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm transition-transform active:scale-90">
            <MoreVertical className="h-5 w-5 text-white" />
          </div>
        </button>
      </div>

      <VideoOptionsSheet
        video={video}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onShare={handleShare}
        onReport={handleReport}
      />

      <CommentsSheet
        videoId={video.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentCountChange={(delta) => setCommentCount((count) => Math.max(0, count + delta))}
      />
    </div>
  );
}
