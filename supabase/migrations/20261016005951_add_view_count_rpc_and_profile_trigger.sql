/*
# Add increment_view_count RPC + auto-create profile trigger

## Overview
1. Creates a SECURITY DEFINER function to atomically increment video view counts
2. Creates a trigger to auto-create a profile row when a new auth user signs up

## Changes

### 1. New Function: increment_view_count (SECURITY DEFINER)
- Takes `video_id` parameter (uuid)
- Increments `view_count` on the matching video row by 1
- SECURITY DEFINER so anonymous users (who can't UPDATE videos) can still increment views
- Returns void

### 2. New Trigger: on_auth_user_created
- Fires AFTER INSERT on auth.users
- Creates a corresponding row in `profiles` table with default tier 'free'
- Ensures every new signup has a profile without requiring a separate client call

## Security
- The increment function is SECURITY DEFINER and only does a controlled increment — it does not
  expose any other columns or allow arbitrary updates
- The trigger runs with elevated privileges but only INSERTs a default profile row
- Both are safe: neither reads or returns sensitive data
*/
CREATE OR REPLACE FUNCTION increment_view_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE videos SET view_count = view_count + 1 WHERE id = video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_view_count(uuid) TO anon, authenticated;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, tier)
  VALUES (NEW.id, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
