import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/services/supabase';
import type { Video } from '@/types';

const PAGE_SIZE = 10;

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);

  const loadVideos = useCallback(async (reset: boolean = false) => {
    if (reset) {
      setInitialLoading(true);
      offsetRef.current = 0;
    } else {
      if (loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    setError(null);

    const offset = reset ? 0 : offsetRef.current;

    const { data, error: queryError } = await supabase
      .from('videos')
      .select(
        'id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, view_count, like_count, comment_count, share_count, created_at'
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (queryError) {
      setError(queryError.message);
      setInitialLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return;
    }

    if (!data || data.length === 0) {
      setHasMore(false);
      setInitialLoading(false);
      setLoadingMore(false);
      loadingMoreRef.current = false;
      return;
    }

    if (reset) {
      setVideos(data);
    } else {
      setVideos((prev) => [...prev, ...data]);
    }
    offsetRef.current = offset + data.length;

    if (data.length < PAGE_SIZE) {
      setHasMore(false);
    }

    setInitialLoading(false);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }, []);

  return { videos, initialLoading, loadingMore, hasMore, error, loadVideos };
}
