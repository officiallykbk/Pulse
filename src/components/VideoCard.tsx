import { useRef, useState, useCallback, useEffect } from 'react';
import { VideoPlayer, type PlayerSlotState } from '@/components/VideoPlayer';
import { VideoOptionsSheet } from '@/components/VideoOptionsSheet';
import { CommentsSheet } from '@/components/CommentsSheet';
import { Heart, Share2, MoreVertical, Eye, MessageCircle, UserPlus, UserCheck } from 'lucide-react';
import { useLikes } from '@/hooks/useLikes';
import { useFollow } from '@/hooks/useFollow';
import { feedActions } from '@/lib/feedActions';
import { supabase } from '@/services/supabase';
import { APP_IDENTITY } from '@/config/appIdentity';
import type { Video, UserTier } from '@/types';

interface VideoCardProps {
  video: Video;
  isActive: boolean;
  slotState?: PlayerSlotState;
  tier: UserTier;
  onRequireAuth: () => void;
}

type ToastType = 'like' | 'unlike' | 'share' | 'report' | null;

export function VideoCard({ video, isActive, slotState, tier, onRequireAuth }: VideoCardProps) {
  const { liked, likeCount, toggleLike } = useLikes(video.id, video.like_count);
  const { following, busy, toggleFollow } = useFollow(video.uploader_id);
  const [showHeart, setShowHeart] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null);
  const lastTapRef = useRef(0);
  const viewedRef = useRef(false);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2000);
  }, []);

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
      showToast('like', 'Added to your liked videos');
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  }, [liked, toggleLike, tier, onRequireAuth, showToast]);

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
      showToast('unlike', 'Removed from liked videos');
    } else {
      showToast('like', 'Added to your liked videos');
    }
  }, [tier, toggleLike, onRequireAuth, liked, showToast]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: video.title,
      text: APP_IDENTITY.share.buildVideoShareText(video.description),
      url: window.location.href,
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
      showToast('share', typeof navigator.share === 'function' ? 'Shared!' : 'Link copied to clipboard');
    }
  }, [video.title, video.description, video.id, showToast]);

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
      showToast('report', 'Could not submit report. Try again.');
    } else {
      showToast('report', 'Report submitted. Thank you.');
    }
  }, [video.id, tier, onRequireAuth, showToast]);

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
      showToast('like', following ? 'Unfollowed creator' : 'Following creator!');
    }
  }, [tier, onRequireAuth, toggleFollow, following, showToast]);

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

  const toastIcon = (() => {
    switch (toast?.type) {
      case 'like': return <Heart className="h-4 w-4 fill-accent text-accent" />;
      case 'unlike': return <Heart className="h-4 w-4 text-white/60" />;
      case 'share': return <Share2 className="h-4 w-4 text-accent" />;
      case 'report': return null;
      default: return null;
    }
  })();

  return (
    <div className="absolute inset-0">
      <VideoPlayer
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

      <div className="absolute bottom-16 left-0 right-0 z-20 px-4 pb-1" style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}>
        <h2 className="mb-1 text-base font-semibold text-white">{video.title}</h2>
        {video.description && (
          <p className="line-clamp-2 text-sm text-white/70">{video.description}</p>
        )}
      </div>

      <div className="absolute bottom-16 right-3 z-20 flex flex-col items-center gap-4">
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
          <span className="text-[11px] font-medium text-white/80">{formatCount(video.comment_count)}</span>
        </button>

        <div className="flex flex-col items-center gap-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm">
            <Eye className="h-5 w-5 text-white" />
          </div>
          <span className="text-[11px] font-medium text-white/80">{formatCount(video.view_count)}</span>
        </div>

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

      {toast && (
        <div
          className="absolute bottom-28 left-1/2 z-40 -translate-x-1/2"
          style={{ animation: 'fadeInDown 0.3s ease-out' }}
        >
          <div className="flex items-center gap-2 rounded-full bg-black/85 px-4 py-2 backdrop-blur-sm">
            {toastIcon}
            <span className="text-sm text-white">{toast.message}</span>
          </div>
        </div>
      )}

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
      />
    </div>
  );
}
