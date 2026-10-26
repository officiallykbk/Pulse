/*
# Create core tables: videos, profiles, subscriptions

## Overview
Creates the three core tables for the Ghana Short-Video Platform:
- `videos` — public video content for the feed
- `profiles` — user tier information
- `subscriptions` — Pro subscription records linked to Paystack payments

## New Tables

### 1. videos
- `id` (uuid, PK, default gen_random_uuid())
- `title` (text, not null) — video title
- `description` (text, nullable) — optional description
- `video_url` (text, not null) — CDN URL (Simplifyd or direct)
- `thumbnail_url` (text, nullable) — poster image URL
- `duration_seconds` (int, default 0) — video length for display
- `uploader_id` (uuid, FK auth.users, nullable) — creator
- `is_active` (boolean, default true) — moderation flag
- `created_at` (timestamptz, default now())

### 2. profiles
- `id` (uuid, PK, FK auth.users ON DELETE CASCADE) — one row per user
- `tier` (text, default 'free') — 'free' or 'pro'
- `display_name` (text, nullable) — optional display name
- `created_at` (timestamptz, default now())

### 3. subscriptions
- `id` (uuid, PK, default gen_random_uuid())
- `user_id` (uuid, FK auth.users ON DELETE CASCADE)
- `tier` (text, default 'pro') — subscription tier
- `status` (text, default 'active') — 'active', 'expired', 'cancelled'
- `paystack_reference` (text, nullable) — payment reference from Paystack
- `started_at` (timestamptz, default now())
- `expires_at` (timestamptz, nullable) — subscription end date
- `created_at` (timestamptz, default now())

## Security (RLS Policies)

### videos
- SELECT: public (TO anon, authenticated) — anyone can browse the feed
- INSERT/UPDATE/DELETE: authenticated owner only (uploader_id = auth.uid())

### profiles
- SELECT: authenticated, own row only (auth.uid() = id)
- INSERT: authenticated, own row only (auth.uid() = id, DEFAULT auth.uid())
- UPDATE: authenticated, own row only (auth.uid() = id)

### subscriptions
- SELECT: authenticated, own row only (auth.uid() = user_id)
- INSERT: authenticated, own row only (auth.uid() = user_id, DEFAULT auth.uid())
- UPDATE/DELETE: restricted — only via SECURITY DEFINER function for Paystack webhook

## Important Notes
1. `profiles.id` defaults to `auth.uid()` so insert works when client omits id
2. `subscriptions.user_id` defaults to `auth.uid()` for same reason
3. videos are public-readable so anonymous users can browse the feed
4. UPDATE on subscriptions is NOT granted to authenticated users directly —
   only the Paystack webhook edge function (service role) can update subscription status
*/

-- ============ videos table ============
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  duration_seconds int DEFAULT 0,
  uploader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

-- Public read: anonymous users can browse the feed
DROP POLICY IF EXISTS "public_select_videos" ON videos;
CREATE POLICY "public_select_videos"
ON videos FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Only uploader can insert
DROP POLICY IF EXISTS "uploader_insert_videos" ON videos;
CREATE POLICY "uploader_insert_videos"
ON videos FOR INSERT
TO authenticated
WITH CHECK (uploader_id = auth.uid());

-- Only uploader can update their videos
DROP POLICY IF EXISTS "uploader_update_videos" ON videos;
CREATE POLICY "uploader_update_videos"
ON videos FOR UPDATE
TO authenticated
USING (uploader_id = auth.uid())
WITH CHECK (uploader_id = auth.uid());

-- Only uploader can delete their videos
DROP POLICY IF EXISTS "uploader_delete_videos" ON videos;
CREATE POLICY "uploader_delete_videos"
ON videos FOR DELETE
TO authenticated
USING (uploader_id = auth.uid());

-- ============ profiles table ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  tier text NOT NULL DEFAULT 'free',
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile"
ON profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ============ subscriptions table ============
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  tier text NOT NULL DEFAULT 'pro',
  status text NOT NULL DEFAULT 'active',
  paystack_reference text,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscriptions" ON subscriptions;
CREATE POLICY "select_own_subscriptions"
ON subscriptions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;
CREATE POLICY "insert_own_subscriptions"
ON subscriptions FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- No UPDATE or DELETE policy for authenticated users on subscriptions.
-- Subscription status changes are handled server-side via edge function (service role).

-- ============ Indexes ============
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_is_active ON videos (is_active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
