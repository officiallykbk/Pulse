/*
# MVP Publishing Workflow, Permissions & Admin Moderation

## Overview
Implements TikTok-audit MVP backend capabilities:
1. Publishing Workflow State Machine:
   - status: 'uploading' -> 'uploaded' -> 'processing' -> 'pending_review' -> 'published' (or 'rejected')
   - All videos require manual admin review before publishing (is_active = false until approved).
2. Permissions & Visibility:
   - visibility: 'public' | 'private' | 'age_restricted'
3. Comment Moderation & User Banning:
   - Admin roles ('admin', 'moderator', 'user')
   - User ban flags ('is_banned', 'banned_at', 'ban_reason')
   - Admins can delete any comment and ban/unban users.
   - Banned users cannot post comments or upload videos.
*/

-- 1. Alter videos table for MVP workflow & visibility
ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_status_check;

ALTER TABLE videos
  ADD CONSTRAINT videos_status_check
    CHECK (status IN ('uploading', 'uploaded', 'processing', 'pending_review', 'published', 'ready', 'failed', 'rejected'));

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'age_restricted')),
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- Index for public feed queries
CREATE INDEX IF NOT EXISTS idx_videos_feed_mvp 
  ON videos(created_at DESC) 
  WHERE is_active = true AND status IN ('published', 'ready') AND visibility = 'public';

-- Index for admin review queue
CREATE INDEX IF NOT EXISTS idx_videos_pending_review 
  ON videos(created_at ASC) 
  WHERE status = 'pending_review';

-- 2. Alter profiles table for roles and moderation bans
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'moderator')),
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason text;

CREATE INDEX IF NOT EXISTS idx_profiles_banned ON profiles(is_banned) WHERE is_banned = true;

-- 3. Update RLS policies on videos
DROP POLICY IF EXISTS "public_select_videos" ON videos;
CREATE POLICY "public_select_videos"
ON videos FOR SELECT
TO anon, authenticated
USING (
  -- Public published videos
  (is_active = true AND status IN ('published', 'ready') AND visibility = 'public')
  -- Or the creator themselves viewing their own uploads
  OR (auth.uid() IS NOT NULL AND uploader_id = auth.uid())
  -- Or platform admins / moderators
  OR (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'moderator')
  ))
);

-- Ensure banned users cannot insert videos
DROP POLICY IF EXISTS "uploader_insert_videos" ON videos;
CREATE POLICY "uploader_insert_videos"
ON videos FOR INSERT
TO authenticated
WITH CHECK (
  uploader_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_banned = true
  )
);

-- Allow admins or uploaders to update videos
DROP POLICY IF EXISTS "uploader_update_videos" ON videos;
CREATE POLICY "uploader_or_admin_update_videos"
ON videos FOR UPDATE
TO authenticated
USING (
  uploader_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'moderator')
  )
)
WITH CHECK (
  uploader_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'moderator')
  )
);

-- 4. Update RLS policies on comments
-- Disallow banned users from posting comments
DROP POLICY IF EXISTS "insert_own_comment" ON comments;
CREATE POLICY "insert_own_comment"
ON comments FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_banned = true
  )
);

-- Allow owner or admin to delete comment
DROP POLICY IF EXISTS "delete_own_comment" ON comments;
CREATE POLICY "delete_own_or_admin_comment"
ON comments FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'moderator')
  )
);

-- 5. Allow admins to update user profiles (for banning / unbanning)
DROP POLICY IF EXISTS "admin_update_profiles" ON profiles;
CREATE POLICY "admin_update_profiles"
ON profiles FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
  )
);
