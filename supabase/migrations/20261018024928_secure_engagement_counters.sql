/*
# Secure engagement counter functions

1. Purpose
Four database functions bump engagement counters:
- increment_view_count
- increment_share_count
- increment_comment_count
- decrement_comment_count

Today anyone — including completely anonymous visitors — can call any of
them directly and inflate any video's counters without limit. This migration
locks them down:

1. Only signed-in users can bump views and shares (EXECUTE revoked from anon;
   the functions also reject calls with no signed-in user).
2. One view per user per video per 24 hours: repeated swipes by the same
   viewer no longer inflate the counter.
3. Comment counts are maintained automatically by triggers on the comments
   table. Direct calls to the comment-count functions are made inert, and
   no client role can execute them.
4. Share counting stays per-share (each share is real) but signed-in only.

2. Modified tables
- videos: no schema change; the counters gain the protections above.

3. New objects
- public.video_views (table): one row per (video, distinct viewer). RLS
  enabled with no policies — locked to all client roles; only the
  SECURITY DEFINER functions write it.
- Trigger functions on_comment_created / on_comment_deleted.

4. Security changes
- EXECUTE on all four functions revoked from anon and authenticated.
- increment_view_count / increment_share_count granted back to
  authenticated only, and both no-op without a signed-in user.
- Comment-count functions get no grants: they run only inside triggers.

5. Important notes
- Existing functions are dropped and recreated with their original
  parameter name (video_id) so existing callers keep working.
- All statements are idempotent; the migration is safe to re-run.
*/

-- 1. Distinct-view tracking table
CREATE TABLE IF NOT EXISTS public.video_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, viewer_id)
);

ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;
-- No policies: no client role can read or write video_views directly.

CREATE INDEX IF NOT EXISTS idx_video_views_video
  ON public.video_views (video_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_views_viewer
  ON public.video_views (viewer_id, viewed_at DESC);

-- 2. Drop originals, then recreate with the same signature.
DROP FUNCTION IF EXISTS public.increment_view_count(uuid);
DROP FUNCTION IF EXISTS public.increment_share_count(uuid);
DROP FUNCTION IF EXISTS public.increment_comment_count(uuid);
DROP FUNCTION IF EXISTS public.decrement_comment_count(uuid);

-- View counting: signed-in only, one per user per video per 24h.
CREATE FUNCTION public.increment_view_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_viewer uuid := auth.uid();
  v_recent boolean;
BEGIN
  IF v_viewer IS NULL THEN
    RETURN;
  END IF;

  -- Did this viewer already have a view row recorded before this call?
  SELECT EXISTS (
    SELECT 1
    FROM public.video_views v
    WHERE v.video_id = increment_view_count.video_id
      AND v.viewer_id = v_viewer
      AND v.viewed_at > now() - interval '24 hours'
  ) INTO v_recent;

  INSERT INTO public.video_views (video_id, viewer_id)
  VALUES (increment_view_count.video_id, v_viewer)
  ON CONFLICT (video_id, viewer_id) DO UPDATE
    SET viewed_at = now();

  -- Fresh viewer (no prior row) is counted; repeat views within 24h are not.
  IF NOT v_recent THEN
    UPDATE public.videos
    SET view_count = view_count + 1
    WHERE id = increment_view_count.video_id;
  END IF;
END;
$$;

-- Share counting: signed-in only, counted per share.
CREATE FUNCTION public.increment_share_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.videos
  SET share_count = share_count + 1
  WHERE id = increment_share_count.video_id;
END;
$$;

-- Comment counts: kept for trigger compatibility, inert on direct call.
CREATE FUNCTION public.increment_comment_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RETURN;
  END IF;

  UPDATE public.videos
  SET comment_count = comment_count + 1
  WHERE id = increment_comment_count.video_id;
END;
$$;

CREATE FUNCTION public.decrement_comment_count(video_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() = 0 THEN
    RETURN;
  END IF;

  UPDATE public.videos
  SET comment_count = GREATEST(comment_count - 1, 0)
  WHERE id = decrement_comment_count.video_id;
END;
$$;

-- 3. Trigger functions and triggers for automatic comment counting.
CREATE OR REPLACE FUNCTION public.on_comment_created()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.videos
  SET comment_count = comment_count + 1
  WHERE id = NEW.video_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_comment_deleted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.videos
  SET comment_count = GREATEST(comment_count - 1, 0)
  WHERE id = OLD.video_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_insert_increment ON public.comments;
DROP TRIGGER IF EXISTS trg_comment_delete_decrement ON public.comments;

CREATE TRIGGER trg_comment_insert_increment
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.on_comment_created();

CREATE TRIGGER trg_comment_delete_decrement
AFTER DELETE ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.on_comment_deleted();

-- 4. Grants: only authenticated may bump views and shares.
REVOKE EXECUTE ON FUNCTION public.increment_view_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_share_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_comment_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_comment_count(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_view_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_count(uuid) TO authenticated;
