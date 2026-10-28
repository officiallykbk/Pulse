import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/services/supabase';
import type { Video } from '@/types';

export interface WatchHistoryItem {
  video: Video;
  positionSeconds: number;
  completed: boolean;
  updatedAt: string;
}

const VIDEO_SELECT = 'id, title, description, video_url, thumbnail_url, duration_seconds, uploader_id, is_active, status, visibility, view_count, like_count, comment_count, share_count, created_at';

export function useWatchHistory(userId: string | null) {
  const [history, setHistory] = useState<WatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setHistory([]);
      return;
    }
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from('video_watch_progress')
        .select('video_id, last_position_seconds, completed, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error || !rows?.length) {
        setHistory([]);
        return;
      }
      const ids = rows.map((row) => row.video_id);
      const { data: videos } = await supabase.from('videos').select(VIDEO_SELECT)
        .in('id', ids).eq('is_active', true).in('status', ['published', 'ready']).eq('visibility', 'public');
      const videoMap = new Map((videos ?? []).map((video) => [video.id, video]));
      setHistory(rows.flatMap((row) => {
        const video = videoMap.get(row.video_id);
        return video ? [{
          video,
          positionSeconds: Number(row.last_position_seconds) || 0,
          completed: Boolean(row.completed),
          updatedAt: row.updated_at,
        }] : [];
      }));
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const clearHistory = useCallback(async () => {
    if (!userId) return { error: 'Sign in to manage watch history.' };
    const { error } = await supabase.from('video_watch_progress').delete().eq('user_id', userId);
    if (!error) setHistory([]);
    return { error: error?.message ?? null };
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { history, loading, refresh, clearHistory };
}
