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

export const STANDARD_CATEGORIES = [
  'Entertainment',
  'Music',
  'Dance',
  'Comedy',
  'News',
  'Education',
  'Sports',
  'Culture',
] as const;

export type VideoCategory = (typeof STANDARD_CATEGORIES)[number];

export const REJECTION_REASON_PRESETS = [
  'Inappropriate or explicit content',
  'Spam, misleading or promotional abuse',
  'Copyright or intellectual property violation',
  'Low video or audio quality',
  'Harassment, hate speech, or abuse',
] as const;

export interface VideoModerationFilter {
  status?: 'all' | 'pending_review' | 'published' | 'rejected';
  category?: string;
  searchQuery?: string;
  limit?: number;
}

/**
 * Fetch videos matching moderation filters (status, category, search).
 */
export async function getVideosForModeration(
  filter: VideoModerationFilter = {}
): Promise<PendingVideo[]> {
  const { status = 'all', category, searchQuery, limit = 50 } = filter;

  let query = supabase
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
      category,
      tags,
      view_count,
      like_count,
      comment_count,
      share_count,
      created_at
    `);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (category && category !== 'all') {
    query = query.eq('category', category);
  }

  if (searchQuery?.trim()) {
    query = query.ilike('title', `%${searchQuery.trim()}%`);
  }

  const { data: videos, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch videos for moderation: ${error.message}`);
  }

  if (!videos || videos.length === 0) {
    return [];
  }

  // Fetch uploader profile metadata for each video
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
 * Fetch videos awaiting manual administrative review.
 */
export async function getPendingReviewVideos(): Promise<PendingVideo[]> {
  const res = await getVideosForModeration({ status: 'pending_review' });
  return res.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
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
 * Update a video's category and tags as an administrator.
 */
export async function updateVideoCategoryAndTags(
  videoId: string,
  category: string,
  tags: string[]
): Promise<void> {
  const sanitizedTags = [...new Set(tags.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))];
  const { error } = await supabase
    .from('videos')
    .update({
      category: category.trim(),
      tags: sanitizedTags,
    })
    .eq('id', videoId);

  if (error) {
    throw new Error(`Failed to update video metadata: ${error.message}`);
  }
}

/**
 * Delete or soft-delete a video as an administrator.
 */
export async function deleteVideoAsAdmin(videoId: string, soft = true): Promise<void> {
  if (soft) {
    const { error } = await supabase
      .from('videos')
      .update({
        is_active: false,
        status: 'rejected',
        rejection_reason: 'Removed by platform administrator',
      })
      .eq('id', videoId);

    if (error) {
      throw new Error(`Failed to remove video: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId);

    if (error) {
      throw new Error(`Failed to delete video: ${error.message}`);
    }
  }
}

/**
 * Bulk approve multiple videos at once.
 */
export async function bulkApproveVideos(videoIds: string[], adminId: string): Promise<void> {
  if (videoIds.length === 0) return;
  const { error } = await supabase
    .from('videos')
    .update({
      status: 'published',
      is_active: true,
      rejection_reason: null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
    })
    .in('id', videoIds);

  if (error) {
    throw new Error(`Bulk approve failed: ${error.message}`);
  }
}

/**
 * Bulk assign a category to multiple videos.
 */
export async function bulkAssignCategory(videoIds: string[], category: string): Promise<void> {
  if (videoIds.length === 0) return;
  const { error } = await supabase
    .from('videos')
    .update({ category })
    .in('id', videoIds);

  if (error) {
    throw new Error(`Bulk assign category failed: ${error.message}`);
  }
}

/**
 * Bulk delete (soft or hard) multiple videos.
 */
export async function bulkDeleteVideos(videoIds: string[], soft = true): Promise<void> {
  if (videoIds.length === 0) return;
  if (soft) {
    const { error } = await supabase
      .from('videos')
      .update({
        is_active: false,
        status: 'rejected',
        rejection_reason: 'Removed by platform administrator (bulk action)',
      })
      .in('id', videoIds);

    if (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from('videos')
      .delete()
      .in('id', videoIds);

    if (error) {
      throw new Error(`Bulk delete failed: ${error.message}`);
    }
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
