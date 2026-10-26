import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/services/supabase';

export function useLikes(videoId: string, initialLikeCount: number = 0) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('likes')
        .select('id')
        .eq('video_id', videoId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled) {
        setLiked(!!data);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoId]);

  const toggleLike = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return { error: 'Sign in to like videos' };
    }

    if (liked) {
      const { error } = await supabase
        .from('likes')
        .delete()
        .eq('video_id', videoId)
        .eq('user_id', user.id);
      if (!error) {
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
      setLoading(false);
      return { error: error?.message ?? null };
    } else {
      const { error } = await supabase
        .from('likes')
        .insert({ video_id: videoId, user_id: user.id });
      if (!error) {
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
      setLoading(false);
      return { error: error?.message ?? null };
    }
  }, [videoId, liked, loading]);

  return { liked, likeCount, loading, toggleLike, setLiked, setLikeCount };
}
