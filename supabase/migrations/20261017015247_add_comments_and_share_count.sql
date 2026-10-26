/*
# Add comments table, share_count, and comment_count to videos

## Overview
Adds full commenting system and share tracking.

## Changes

### 1. New Table: comments
- id (uuid PK)
- video_id (uuid FK videos, ON DELETE CASCADE)
- user_id (uuid FK auth.users, ON DELETE CASCADE, DEFAULT auth.uid())
- text (text, NOT NULL, max 500 chars enforced by app)
- created_at (timestamptz, default now())

### 2. Modified Table: videos
- New column: comment_count (int, default 0)
- New column: share_count (int, default 0)

## RLS Policies for comments
- SELECT: public (TO anon, authenticated) — anyone can read comments
- INSERT: authenticated, own row only (auth.uid() = user_id)
- DELETE: authenticated, own row only (auth.uid() = user_id)
- No UPDATE — comments are insert-or-delete only
*/
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_select_comments" ON comments;
CREATE POLICY "public_select_comments"
ON comments FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "insert_own_comment" ON comments;
CREATE POLICY "insert_own_comment"
ON comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_comment" ON comments;
CREATE POLICY "delete_own_comment"
ON comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comment_count and share_count to videos (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'comment_count') THEN
    ALTER TABLE videos ADD COLUMN comment_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos' AND column_name = 'share_count') THEN
    ALTER TABLE videos ADD COLUMN share_count int NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments (video_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments (user_id);

-- RPC to increment share count (callable by anon since shares are passive)
CREATE OR REPLACE FUNCTION increment_share_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE videos SET share_count = share_count + 1 WHERE id = video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_share_count(uuid) TO anon, authenticated;

-- RPC to increment comment count
CREATE OR REPLACE FUNCTION increment_comment_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE videos SET comment_count = comment_count + 1 WHERE id = video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_comment_count(uuid) TO anon, authenticated;

-- RPC to decrement comment count (when a comment is deleted)
CREATE OR REPLACE FUNCTION decrement_comment_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE videos SET comment_count = GREATEST(0, comment_count - 1) WHERE id = video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION decrement_comment_count(uuid) TO anon, authenticated;
