export type UserTier = 'anonymous' | 'free' | 'pro';
export type UserRole = 'user' | 'admin' | 'moderator';

export type VideoStatus =
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'pending_review'
  | 'published'
  | 'ready'
  | 'failed'
  | 'rejected';

export type VideoVisibility = 'public' | 'private' | 'age_restricted';

export interface Video {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  uploader_id: string | null;
  uploader?: {
    id?: string;
    display_name?: string | null;
    avatar_url?: string | null;
  } | null;
  is_active: boolean;
  status?: VideoStatus;
  visibility?: VideoVisibility;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  hls_master_url?: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  created_at: string;
}

export interface Like {
  id: string;
  video_id: string;
  user_id: string;
  created_at: string;
}

export interface Comment {
  id: string;
  video_id: string;
  user_id: string;
  text: string;
  created_at: string;
}

export interface FeedItem {
  type: 'video' | 'ad';
  id: string;
  video?: Video;
}

export interface Profile {
  id: string;
  tier: UserTier;
  role?: UserRole;
  is_banned?: boolean;
  banned_at?: string | null;
  ban_reason?: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  paystack_reference: string | null;
  started_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface AdConfig {
  frequency: number;
  skipDelay: number;
}

export interface AuthState {
  user: { id: string; email: string } | null;
  tier: UserTier;
  loading: boolean;
}
