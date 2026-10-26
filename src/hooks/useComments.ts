import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/services/supabase';
import type { Comment } from '@/types';

interface CommentWithAuthor extends Comment {
  author_email: string | null;
}

export function useComments(videoId: string) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('comments')
      .select(`
        id,
        video_id,
        user_id,
        text,
        created_at
      `)
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .in('id', userIds);

      // Fetch emails from auth via the user's own session isn't possible client-side.
      // We'll show a derived display name instead.
      const profileMap = new Map<string, boolean>();
      (profiles ?? []).forEach((p) => profileMap.set(p.id, true));

      const enriched: CommentWithAuthor[] = data.map((c) => ({
        ...c,
        author_email: null,
      }));
      setComments(enriched);
    } else {
      setComments([]);
    }
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const postComment = useCallback(async (text: string): Promise<{ error: string | null }> => {
    const trimmed = text.trim();
    if (!trimmed) return { error: 'Comment cannot be empty' };
    if (trimmed.length > 500) return { error: 'Comment is too long (max 500 characters)' };

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sign in to comment' };

    setPosting(true);
    const { data, error } = await supabase
      .from('comments')
      .insert({ video_id: videoId, user_id: user.id, text: trimmed })
      .select('id, video_id, user_id, text, created_at')
      .single();

    if (error) {
      setPosting(false);
      return { error: error.message };
    }

    const newComment: CommentWithAuthor = { ...data, author_email: null };
    setComments((prev) => [newComment, ...prev]);
    setPosting(false);
    return { error: null };
  }, [videoId]);

  const deleteComment = useCallback(async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (!error) {
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    }
  }, [videoId]);

  return { comments, loading, posting, postComment, deleteComment, refetch: fetchComments };
}
