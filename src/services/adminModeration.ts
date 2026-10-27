import { supabase } from '@/services/supabase';
import type { Video, Comment, Profile } from '@/types';

export interface PendingVideo extends Video {
  uploader?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ModerationComment extends Comment {
  author?: {
    display_name: string;
    avatar_url: string | null;
  };
  video_title?: string;
}

/**
 * Fetch videos awaiting manual administrative review.
 */
export async function getPendingReviewVideos(): Promise<PendingVideo[]> {
  const { data: videos, error } = await supabase
    .from('videos')
    .select(`
      id,
      title,
      description,
      video_url,
      thumbnail_url,
      duration_seconds,
      uploader_id,
      is_active,
      status,
      visibility,
      rejection_reason,
      view_count,
      like_count,
      comment_count,
      share_count,
      created_at
    `)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch pending videos: ${error.message}`);
  }

  if (!videos || videos.length === 0) {
    return [];
  }

  // Fetch uploader profile metadata for each pending video
  const uploaderIds = [...new Set(videos.map((v) => v.uploader_id).filter(Boolean))] as string[];
  const profileMap = new Map<string, { id: string; display_name: string | null; avatar_url: string | null }>();

  if (uploaderIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .in('id', uploaderIds);

    (profiles ?? []).forEach((p) => profileMap.set(p.id, p));
  }

  return videos.map((v) => ({
    ...v,
    uploader: v.uploader_id ? profileMap.get(v.uploader_id) ?? null : null,
  }));
}

/**
 * Approve a pending video for publication.
 * Sets status='published' and is_active=true.
 */
export async function approveVideo(videoId: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('videos')
    .update({
      status: 'published',
      is_active: true,
      rejection_reason: null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  if (error) {
    throw new Error(`Failed to approve video: ${error.message}`);
  }
}

/**
 * Reject a pending video.
 * Sets status='rejected' and is_active=false with the given reason.
 */
export async function rejectVideo(videoId: string, reason: string, adminId: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('Rejection reason is required.');
  }

  const { error } = await supabase
    .from('videos')
    .update({
      status: 'rejected',
      is_active: false,
      rejection_reason: reason.trim(),
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', videoId);

  if (error) {
    throw new Error(`Failed to reject video: ${error.message}`);
  }
}

/**
 * Fetch recent comments across the platform for moderation.
 */
export async function getRecentComments(limit = 40): Promise<ModerationComment[]> {
  const { data: comments, error } = await supabase
    .from('comments')
    .select(`
      id,
      video_id,
      user_id,
      text,
      created_at
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch comments: ${error.message}`);
  }

  if (!comments || comments.length === 0) return [];

  const userIds = [...new Set(comments.map((c) => c.user_id))];
  const videoIds = [...new Set(comments.map((c) => c.video_id))];

  const profileMap = new Map<string, { display_name: string; avatar_url: string | null }>();
  const videoMap = new Map<string, string>();

  const [profilesRes, videosRes] = await Promise.all([
    userIds.length > 0 ? supabase.from('profiles').select('id, display_name, avatar_url').in('id', userIds) : null,
    videoIds.length > 0 ? supabase.from('videos').select('id, title').in('id', videoIds) : null,
  ]);

  (profilesRes?.data ?? []).forEach((p) => {
    profileMap.set(p.id, {
      display_name: p.display_name?.trim() || `User ${p.id.slice(0, 4).toUpperCase()}`,
      avatar_url: p.avatar_url ?? null,
    });
  });

  (videosRes?.data ?? []).forEach((v) => {
    videoMap.set(v.id, v.title);
  });

  return comments.map((c) => ({
    ...c,
    author: profileMap.get(c.user_id) ?? {
      display_name: `User ${c.user_id.slice(0, 4).toUpperCase()}`,
      avatar_url: null,
    },
    video_title: videoMap.get(c.video_id) || 'Untitled Video',
  }));
}

/**
 * Delete any comment as an administrator.
 */
export async function deleteCommentAsAdmin(commentId: string): Promise<void> {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    throw new Error(`Failed to delete comment: ${error.message}`);
  }
}

/**
 * Search or list user profiles for moderation.
 */
export async function getProfilesForModeration(searchQuery = '', limit = 30): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (searchQuery.trim()) {
    query = query.ilike('display_name', `%${searchQuery.trim()}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to load users: ${error.message}`);
  }

  return (data ?? []) as Profile[];
}

/**
 * Ban a user and prevent them from uploading or commenting.
 */
export async function banUser(userId: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new Error('Ban reason is required.');
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      is_banned: true,
      ban_reason: reason.trim(),
      banned_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to ban user: ${error.message}`);
  }
}

/**
 * Lift a ban from a user profile.
 */
export async function unbanUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      is_banned: false,
      ban_reason: null,
      banned_at: null,
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to unban user: ${error.message}`);
  }
}
