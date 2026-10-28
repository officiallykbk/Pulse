import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import type { Video } from '@/types';

const VIDEO_SELECT = 'id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, status, visibility, view_count, like_count, comment_count, share_count, created_at';

export function useSavedVideos(userId: string | null) {
  const [savedVideos, setSavedVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSavedVideos([]);
      return;
    }
    setLoading(true);
    try {
      const { data: savedRows, error } = await supabase
        .from('saved_videos')
        .select('video_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !savedRows?.length) {
        setSavedVideos([]);
        return;
      }

      const ids = savedRows.map((row) => row.video_id);
      const { data: videos } = await supabase
        .from('videos')
        .select(VIDEO_SELECT)
        .in('id', ids)
        .eq('is_active', true)
        .in('status', ['published', 'ready'])
        .eq('visibility', 'public');
      const videosById = new Map<string, Video>((videos ?? []).map((video) => [video.id, video as Video]));
      setSavedVideos(ids.flatMap((id) => {
        const video = videosById.get(id);
        return video ? [video] : [];
      }));
    } catch {
      setSavedVideos([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { savedVideos, loading, refresh };
}
