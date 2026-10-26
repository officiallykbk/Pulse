/*
# Add likes table and view_count column to videos

## Overview
Adds user engagement features: likes (with per-user tracking) and view counts.

## Changes

### 1. New Table: likes
- `id` (uuid, PK)
- `video_id` (uuid, FK videos, ON DELETE CASCADE)
- `user_id` (uuid, FK auth.users, ON DELETE CASCADE, DEFAULT auth.uid())
- `created_at` (timestamptz, default now())
- UNIQUE constraint on (video_id, user_id) — one like per user per video

### 2. Modified Table: videos
- New column: `view_count` (int, default 0) — tracks total views
- New column: `like_count` (int, default 0) — cached like count for fast reads

## Security (RLS Policies)

### likes
- SELECT: public (TO anon, authenticated) — anyone can see who liked
- INSERT: authenticated, own row only (auth.uid() = user_id)
- DELETE: authenticated, own row only (auth.uid() = user_id)
- No UPDATE — likes are insert-or-delete only

## Important Notes
1. `likes.user_id` defaults to `auth.uid()` so insert works without client passing it
2. UNIQUE(video_id, user_id) prevents duplicate likes
3. like_count on videos is a denormalized cache — updated by trigger or app logic
4. view_count incremented by app logic when a video becomes active
*/
CREATE TABLE IF NOT EXISTS likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(video_id, user_id)
);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_likes" ON likes;
CREATE POLICY "public_select_likes"
ON likes FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "insert_own_like" ON likes;
CREATE POLICY "insert_own_like"
ON likes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_like" ON likes;
CREATE POLICY "delete_own_like"
ON likes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add view_count and like_count to videos (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'view_count') THEN
    ALTER TABLE videos ADD COLUMN view_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'like_count') THEN
    ALTER TABLE videos ADD COLUMN like_count int NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_likes_video_id ON likes (video_id);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes (user_id);
