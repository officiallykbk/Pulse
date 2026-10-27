import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/services/supabase';
import type { Comment } from '@/types';

export interface CommentWithAuthor extends Comment {
  helpfulCount: number;
  viewerFoundHelpful: boolean;
  author: {
    display_name: string;
    avatar_url: string | null;
  };
}

interface ProfileSummary {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

function fallbackName(userId: string): string {
  return `Pulse member ${userId.slice(0, 4).toUpperCase()}`;
}

function enrichComment(comment: Comment, profile?: ProfileSummary): CommentWithAuthor {
  return {
    ...comment,
    helpfulCount: 0,
    viewerFoundHelpful: false,
    author: {
      display_name: profile?.display_name?.trim() || fallbackName(comment.user_id),
      avatar_url: profile?.avatar_url ?? null,
    },
  };
}

export function useComments(videoId: string, enabled = true) {
  const [comments, setComments] = useState<CommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const reactionRequestIdsRef = useRef(new Set<string>());

  const fetchComments = useCallback(async () => {
    if (!enabled) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const { data, error: commentsError } = await supabase
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

    if (requestId !== requestIdRef.current) return;
    if (commentsError) {
      setComments([]);
      setError('Comments took a little detour. Try loading them again.');
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);

      if (requestId !== requestIdRef.current) return;

      const profileMap = new Map<string, ProfileSummary>();
      if (!profilesError) {
        (profiles ?? []).forEach((profile) => profileMap.set(profile.id, profile));
      }

      const enriched = data.map((comment) => enrichComment(comment, profileMap.get(comment.user_id)));
      const { data: reactions } = await supabase.rpc('get_comment_reactions', {
        comment_ids: data.map((comment) => comment.id),
      });

      if (requestId !== requestIdRef.current) return;
      interface CommentReactionPayload {
        comment_id: string;
        helpful_count?: number;
        viewer_liked?: boolean;
      }
      const reactionList = (reactions as CommentReactionPayload[] | null) ?? [];
      const reactionMap = new Map(reactionList.map((reaction) => [reaction.comment_id, reaction]));
      enriched.forEach((comment) => {
        const reaction = reactionMap.get(comment.id);
        if (reaction) {
          comment.helpfulCount = Number(reaction.helpful_count) || 0;
          comment.viewerFoundHelpful = Boolean(reaction.viewer_liked);
        }
      });
      setComments(enriched);
    } else {
      setComments([]);
    }
    setLoading(false);
  }, [enabled, videoId]);

  useEffect(() => {
    if (enabled) {
      void fetchComments();
    } else {
      requestIdRef.current += 1;
      reactionRequestIdsRef.current.clear();
      setComments([]);
      setError(null);
      setLoading(false);
    }
  }, [enabled, fetchComments]);

  const postComment = useCallback(async (text: string): Promise<{ error: string | null }> => {
    const trimmed = text.trim();
    if (!trimmed) return { error: 'Comment cannot be empty' };
    if (trimmed.length > 500) return { error: 'Comment is too long (max 500 characters)' };

    setPosting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: 'Sign in to comment' };

      // Check if user is suspended/banned
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, is_banned, ban_reason')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.is_banned) {
        return { error: `Account suspended: ${profile.ban_reason || 'Commenting has been disabled for your account.'}` };
      }

      const { data, error: insertError } = await supabase
        .from('comments')
        .insert({ video_id: videoId, user_id: user.id, text: trimmed })
        .select('id, video_id, user_id, text, created_at')
        .single();

      if (insertError) {
        return { error: 'That comment did not land. Give it another go.' };
      }

      const newComment = enrichComment(data, profile ?? undefined);
      setComments((prev) => [newComment, ...prev]);
      return { error: null };
    } catch {
      return { error: 'That comment did not land. Check your connection and try again.' };
    } finally {
      setPosting(false);
    }
  }, [videoId]);

  const deleteComment = useCallback(async (commentId: string): Promise<{ error: string | null }> => {
    const previous = comments;
    setComments((current) => current.filter((comment) => comment.id !== commentId));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setComments(previous);
        return { error: 'Sign in to manage your comments.' };
      }

      // Allow admin / moderator to delete any comment
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      const isAdmin = profile?.role === 'admin' || profile?.role === 'moderator';

      let deleteBuilder = supabase.from('comments').delete().eq('id', commentId);
      if (!isAdmin) {
        deleteBuilder = deleteBuilder.eq('user_id', user.id);
      }

      const { error: deleteError } = await deleteBuilder;

      if (deleteError) {
        setComments(previous);
        return { error: 'Could not remove that comment. Please try again.' };
      }

      return { error: null };
    } catch {
      setComments(previous);
      return { error: 'Could not remove that comment. Check your connection and try again.' };
    }
  }, [comments]);

  const toggleHelpful = useCallback(async (commentId: string): Promise<{ error: string | null }> => {
    if (reactionRequestIdsRef.current.has(commentId)) return { error: null };
    const comment = comments.find((item) => item.id === commentId);
    if (!comment) return { error: 'Comment is no longer available.' };

    reactionRequestIdsRef.current.add(commentId);
    let optimisticUpdateApplied = false;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: 'Sign in to mark comments helpful.' };

      optimisticUpdateApplied = true;
      setComments((current) => current.map((item) => item.id === commentId
        ? {
            ...item,
            helpfulCount: Math.max(0, item.helpfulCount + (item.viewerFoundHelpful ? -1 : 1)),
            viewerFoundHelpful: !item.viewerFoundHelpful,
          }
        : item));

      const result = comment.viewerFoundHelpful
        ? await supabase.from('comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id)
        : await supabase.from('comment_likes').insert({ comment_id: commentId, user_id: user.id });
      if (result.error) throw result.error;
      return { error: null };
    } catch {
      if (optimisticUpdateApplied) {
        setComments((current) => current.map((item) => item.id === commentId
          ? {
              ...item,
              helpfulCount: Math.max(0, item.helpfulCount + (comment.viewerFoundHelpful ? 1 : -1)),
              viewerFoundHelpful: comment.viewerFoundHelpful,
            }
          : item));
      }
      return { error: 'Could not update that reaction. Please try again.' };
    } finally {
      reactionRequestIdsRef.current.delete(commentId);
    }
  }, [comments]);

  return { comments, loading, posting, error, postComment, deleteComment, toggleHelpful, refetch: fetchComments };
}
