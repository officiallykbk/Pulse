import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase';
import type { Video } from '@/types';

export function useUserVideos(userId: string | null) {
  const [uploaded, setUploaded] = useState<Video[]>([]);
  const [liked, setLiked] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUploaded = useCallback(async () => {
    if (!userId) {
      setUploaded([]);
      return;
    }
    const { data } = await supabase
      .from('videos')
      .select('*')
      .eq('uploader_id', userId)
      .order('created_at', { ascending: false });
    setUploaded(data ?? []);
  }, [userId]);

  const fetchLiked = useCallback(async () => {
    if (!userId) {
      setLiked([]);
      return;
    }
    const { data: likeData } = await supabase
      .from('likes')
      .select('video_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!likeData || likeData.length === 0) {
      setLiked([]);
      return;
    }

    const videoIds = likeData.map((l) => l.video_id);
    const { data: videoData } = await supabase
      .from('videos')
      .select('*')
      .in('id', videoIds)
      .eq('is_active', true);

    const ordered = (videoData ?? []).sort(
      (a, b) => videoIds.indexOf(a.id) - videoIds.indexOf(b.id)
    );
    setLiked(ordered);
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchUploaded(), fetchLiked()]);
      setLoading(false);
    })();
  }, [fetchUploaded, fetchLiked]);

  return { uploaded, liked, loading, refresh: () => Promise.all([fetchUploaded(), fetchLiked()]) };
}
