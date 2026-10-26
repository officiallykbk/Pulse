import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Keyboard } from 'lucide-react';
import { VideoCard } from '@/components/VideoCard';
import { AdContainer } from '@/components/AdContainer';
import { TopBar } from '@/components/TopBar';
import { useAdFrequency } from '@/hooks/useAdFrequency';
import { useFeedKeyboardShortcuts } from '@/hooks/useFeedKeyboardShortcuts';
import { feedActions } from '@/lib/feedActions';
import type { PlayerSlotState } from '@/components/VideoPlayer';
import type { Video, FeedItem, UserTier } from '@/types';

interface VideoFeedProps {
  videos: Video[];
  tier: UserTier;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onUpgrade: () => void;
  onRequireAuth: () => void;
  onSearch: () => void;
}

export function VideoFeed({
  videos,
  tier,
  hasMore,
  loadingMore,
  onLoadMore,
  onUpgrade,
  onRequireAuth,
  onSearch,
}: VideoFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [adLocked, setAdLocked] = useState(false);
  const { shouldShowAd } = useAdFrequency(tier);

  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    let videoCount = 0;
    for (const video of videos) {
      if (shouldShowAd(videoCount)) {
        items.push({ type: 'ad', id: `ad-${videoCount}` });
      }
      items.push({ type: 'video', id: video.id, video });
      videoCount++;
    }
    return items;
  }, [videos, shouldShowAd]);

  const [activeIndex, setActiveIndex] = useState(0);

  const virtualizer = useVirtualizer({
    count: feedItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => window.innerHeight,
    overscan: 2,
    gap: 0,
  });

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || adLocked) return;

    const itemHeight = el.clientHeight || window.innerHeight;
    const computedIndex = Math.min(
      feedItems.length - 1,
      Math.max(0, Math.round(el.scrollTop / itemHeight))
    );
    if (computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }

    if (!hasMore || loadingMore) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - window.innerHeight * 2;
    if (nearBottom) onLoadMore();
  }, [hasMore, loadingMore, onLoadMore, adLocked, feedItems.length, activeIndex]);

  const scrollToNext = useCallback(() => {
    if (activeIndex + 1 < feedItems.length) {
      virtualizer.scrollToIndex(activeIndex + 1, { align: 'start', behavior: 'smooth' });
    }
  }, [virtualizer, activeIndex, feedItems.length]);

  const scrollToPrev = useCallback(() => {
    if (activeIndex > 0) {
      virtualizer.scrollToIndex(activeIndex - 1, { align: 'start', behavior: 'smooth' });
    }
  }, [virtualizer, activeIndex]);

  useFeedKeyboardShortcuts(feedItems.length > 0 && !adLocked);

  useEffect(() => {
    const offs = [
      feedActions.on('next', scrollToNext),
      feedActions.on('prev', scrollToPrev),
    ];
    return () => offs.forEach((off) => off());
  }, [scrollToNext, scrollToPrev]);

  const [hintVisible, setHintVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setHintVisible(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  // Block all scroll input while a locked ad is on screen (no per-event correction)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !adLocked) return;

    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const preventKeyScroll = (e: KeyboardEvent) => {
      const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '];
      if (scrollKeys.includes(e.key)) {
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', preventScroll, { passive: false });
    el.addEventListener('touchmove', preventScroll, { passive: false });
    el.addEventListener('keydown', preventKeyScroll, { passive: false });
    return () => {
      el.removeEventListener('wheel', preventScroll);
      el.removeEventListener('touchmove', preventScroll);
      el.removeEventListener('keydown', preventKeyScroll);
    };
  }, [adLocked]);

  if (feedItems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="text-center">
          <p className="text-lg font-semibold text-white/80">No videos yet</p>
          <p className="mt-1 text-sm text-white/50">Check back soon for fresh content</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full bg-black">
      <TopBar tier={tier} onUpgrade={onUpgrade} onSearch={onSearch} />
      {hintVisible && (
        <div className="desktop-hint absolute left-1/2 top-16 z-40 -translate-x-1/2">
          <div
            className="flex items-center gap-2 rounded-full bg-black/85 px-4 py-2 backdrop-blur-sm"
            style={{ animation: 'fadeInDown 0.3s ease-out' }}
          >
            <Keyboard className="h-4 w-4 text-white/60" />
            <span className="text-xs text-white/80">
              Use ↑ ↓ to browse, Space to pause, L to like
            </span>
          </div>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
        style={{
          scrollbarWidth: 'none',
          touchAction: adLocked ? 'none' : 'pan-y',
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = feedItems[virtualItem.index];
            if (!item) return null;

            const isItemActive = virtualItem.index === activeIndex;

            let slotState: PlayerSlotState = 'idle';
            if (virtualItem.index === activeIndex) {
              slotState = 'active';
            } else if (virtualItem.index === activeIndex + 1) {
              slotState = 'prefetch';
            } else if (virtualItem.index === activeIndex - 1) {
              slotState = 'paused';
            }

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full snap-start snap-always"
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                  scrollSnapStop: 'always',
                }}
              >
                <div className="relative h-full w-full overflow-hidden bg-black">
                  {item.type === 'ad' ? (
                    <AdContainer
                      tier={tier}
                      onNext={scrollToNext}
                      onUpgrade={onUpgrade}
                      onLockChange={(locked) => {
                        if (isItemActive) setAdLocked(locked);
                      }}
                    />
                  ) : item.video ? (
                    <VideoCard
                      video={item.video}
                      isActive={isItemActive}
                      slotState={slotState}
                      tier={tier}
                      onRequireAuth={onRequireAuth}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {loadingMore && (
          <div className="flex items-center justify-center py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        )}

        {!hasMore && feedItems.length > 0 && (
          <div className="py-6 text-center">
            <p className="text-xs text-white/30">You've seen all videos</p>
          </div>
        )}
      </div>
    </div>
  );
}
