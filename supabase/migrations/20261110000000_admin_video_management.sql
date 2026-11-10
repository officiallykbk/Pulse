/*
# Admin Content Management & Video Controls

## Overview
1. Adds `category` column to `videos` table with default 'Entertainment'.
2. Adds RLS policy allowing platform admins/moderators to delete videos (hard delete) or update category/tags.
3. Indexes videos by category for category-filtered feeds and discovery.
*/

-- 1. Add category column to videos if not exists
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'Entertainment';

CREATE INDEX IF NOT EXISTS idx_videos_category
  ON videos(category)
  WHERE is_active = true AND status IN ('published', 'ready');

-- 2. Allow admins/moderators to delete videos
DROP POLICY IF EXISTS "uploader_delete_videos" ON videos;
DROP POLICY IF EXISTS "uploader_or_admin_delete_videos" ON videos;

CREATE POLICY "uploader_or_admin_delete_videos"
ON videos FOR DELETE
TO authenticated
USING (
  uploader_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
      AND profiles.role IN ('admin', 'moderator')
  )
);
