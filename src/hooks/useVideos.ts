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
        'id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, status, visibility, view_count, like_count, comment_count, share_count, created_at'
      )
      .eq('is_active', true)
      .in('status', ['published', 'ready'])
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

    const uploaderIds = [...new Set(data.map((v) => v.uploader_id).filter(Boolean))] as string[];
    let enrichedVideos: Video[] = data;
    if (uploaderIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', uploaderIds);
      if (profiles && profiles.length > 0) {
        const pMap = new Map(profiles.map((p) => [p.id, p]));
        enrichedVideos = data.map((v) => ({
          ...v,
          uploader: v.uploader_id ? pMap.get(v.uploader_id) ?? null : null,
        }));
      }
    }

    if (reset) {
      setVideos(enrichedVideos);
    } else {
      setVideos((prev) => [...prev, ...enrichedVideos]);
    }
    offsetRef.current = offset + data.length;

    if (data.length < PAGE_SIZE) {
      setHasMore(false);
    }

    setInitialLoading(false);
    setLoadingMore(false);
    loadingMoreRef.current = false;
  }, []);

  const loadVideoById = useCallback(async (videoId: string) => {
    if (!videoId || videos.some((video) => video.id === videoId)) return;
    const { data } = await supabase
      .from('videos')
      .select('id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, status, visibility, view_count, like_count, comment_count, share_count, created_at')
      .eq('id', videoId)
      .eq('is_active', true)
      .in('status', ['published', 'ready'])
      .eq('visibility', 'public')
      .maybeSingle();
    if (data) {
      let enriched: Video = data;
      if (data.uploader_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', data.uploader_id)
          .maybeSingle();
        if (profile) {
          enriched = { ...data, uploader: profile };
        }
      }
      setVideos((current) => current.some((video) => video.id === enriched.id) ? current : [enriched, ...current]);
    }
  }, [videos]);

  const injectVideo = useCallback((video: Video) => {
    setVideos((current) => current.some((v) => v.id === video.id) ? current : [video, ...current]);
  }, []);

  return { videos, initialLoading, loadingMore, hasMore, error, loadVideos, loadVideoById, injectVideo };
}
