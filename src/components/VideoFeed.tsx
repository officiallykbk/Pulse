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
  onAdLockChange?: (locked: boolean) => void;
  initialVideoId?: string | null;
  shareOrigin?: string;
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
  onAdLockChange,
  initialVideoId,
  shareOrigin,
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
  const [containerHeight, setContainerHeight] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerHeight > 0) {
      return window.innerHeight;
    }
    return 800;
  });

  // Track the exact clientHeight of the scroll container to ensure full-bleed card snapping across all screen heights
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measureHeight = () => {
      const h = el.clientHeight;
      if (h > 0 && Math.abs(h - containerHeight) >= 1) {
        setContainerHeight(h);
      }
    };

    measureHeight();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const h = Math.round(entry.contentRect.height);
          if (h > 0 && Math.abs(h - containerHeight) >= 1) {
            setContainerHeight(h);
          }
        }
      });
      ro.observe(el);
    }

    window.addEventListener('resize', measureHeight);
    window.addEventListener('orientationchange', measureHeight);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measureHeight);
      window.removeEventListener('orientationchange', measureHeight);
    };
  }, [containerHeight]);

  const virtualizer = useVirtualizer({
    count: feedItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => containerHeight,
    overscan: 1, // Strict sliding 3-slot window (prev, active, next)
    gap: 0,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [containerHeight, virtualizer]);

  useEffect(() => {
    if (!initialVideoId) return;
    const idx = feedItems.findIndex((item) => item.type === 'video' && item.video?.id === initialVideoId);
    if (idx !== -1) {
      setActiveIndex(idx);
      virtualizer.scrollToIndex(idx, { align: 'start' });
    }
  }, [initialVideoId, feedItems, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || adLocked) return;

    const itemHeight = containerHeight || el.clientHeight || window.innerHeight;
    const computedIndex = Math.min(
      feedItems.length - 1,
      Math.max(0, Math.round(el.scrollTop / itemHeight))
    );
    if (computedIndex !== activeIndex) {
      setActiveIndex(computedIndex);
    }

    if (!hasMore || loadingMore) return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - itemHeight * 2;
    if (nearBottom) onLoadMore();
  }, [hasMore, loadingMore, onLoadMore, adLocked, feedItems.length, activeIndex, containerHeight]);

  const scrollToNext = useCallback(() => {
    if (activeIndex + 1 < feedItems.length) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTo({ top: (activeIndex + 1) * containerHeight, behavior: 'smooth' });
      } else {
        virtualizer.scrollToIndex(activeIndex + 1, { align: 'start', behavior: 'smooth' });
      }
    }
  }, [virtualizer, activeIndex, feedItems.length, containerHeight]);

  const scrollToPrev = useCallback(() => {
    if (activeIndex > 0) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTo({ top: (activeIndex - 1) * containerHeight, behavior: 'smooth' });
      } else {
        virtualizer.scrollToIndex(activeIndex - 1, { align: 'start', behavior: 'smooth' });
      }
    }
  }, [virtualizer, activeIndex, containerHeight]);

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

  useEffect(() => {
    const currentItem = feedItems[activeIndex];
    if (currentItem?.type !== 'ad' && adLocked) {
      setAdLocked(false);
      onAdLockChange?.(false);
    }
  }, [activeIndex, feedItems, adLocked, onAdLockChange]);

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
      <TopBar tier={tier} onUpgrade={onUpgrade} onSearch={onSearch} disabled={adLocked} />
      {hintVisible && !adLocked && (
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
                className="absolute left-0 top-0 w-full snap-start snap-always"
                style={{
                  height: `${containerHeight}px`,
                  transform: `translateY(${virtualItem.index * containerHeight}px)`,
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
                        if (isItemActive) {
                          setAdLocked(locked);
                          onAdLockChange?.(locked);
                        }
                      }}
                    />
                  ) : item.video ? (
                    <VideoCard
                      video={item.video}
                      isActive={isItemActive}
                      slotState={slotState}
                      tier={tier}
                      onRequireAuth={onRequireAuth}
                      shareUrl={shareOrigin ? new URL(`/watch/${item.video.id}`, shareOrigin).toString() : undefined}
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
