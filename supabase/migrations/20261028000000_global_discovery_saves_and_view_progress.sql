-- Tag-based discovery, private saves, playback continuity, and low-volume opted-in viewing insights.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS viewing_insights boolean NOT NULL DEFAULT false;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS search_document tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', array_to_string(tags, ' ')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_videos_search_document
  ON public.videos USING gin (search_document);
CREATE INDEX IF NOT EXISTS idx_videos_tags
  ON public.videos USING gin (tags);

CREATE OR REPLACE FUNCTION public.search_public_videos(search_query text, result_limit integer DEFAULT 30)
RETURNS TABLE (id uuid, relevance real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH query AS (
    SELECT websearch_to_tsquery('simple', nullif(trim(search_query), '')) AS tsq
  )
  SELECT v.id, ts_rank_cd(v.search_document, query.tsq) AS relevance
  FROM public.videos v, query
  WHERE query.tsq IS NOT NULL
    AND numnode(query.tsq) > 0
    AND v.search_document @@ query.tsq
    AND v.is_active = true
    AND v.status IN ('published', 'ready')
    AND v.visibility = 'public'
  ORDER BY relevance DESC, v.created_at DESC
  LIMIT least(greatest(coalesce(result_limit, 30), 1), 50);
$$;
REVOKE ALL ON FUNCTION public.search_public_videos(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_videos(text, integer) TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.saved_videos (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
ALTER TABLE public.saved_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_saved_videos" ON public.saved_videos;
CREATE POLICY "read_own_saved_videos" ON public.saved_videos
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_saved_videos" ON public.saved_videos;
CREATE POLICY "insert_own_saved_videos" ON public.saved_videos
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_saved_videos" ON public.saved_videos;
CREATE POLICY "delete_own_saved_videos" ON public.saved_videos
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_saved_videos_user_recent
  ON public.saved_videos (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_watch_progress (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  last_position_seconds integer NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
ALTER TABLE public.video_watch_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_video_progress" ON public.video_watch_progress;
CREATE POLICY "read_own_video_progress" ON public.video_watch_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_video_progress" ON public.video_watch_progress;
CREATE POLICY "delete_own_video_progress" ON public.video_watch_progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_video_watch_progress(
  target_video_id uuid,
  position_seconds integer,
  did_complete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer uuid := auth.uid();
  video_duration integer;
  safe_position integer;
BEGIN
  IF viewer IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT duration_seconds INTO video_duration
  FROM public.videos
  WHERE id = target_video_id
    AND is_active = true
    AND status IN ('published', 'ready')
    AND visibility = 'public';

  IF video_duration IS NULL THEN
    RAISE EXCEPTION 'Video is unavailable';
  END IF;

  safe_position := least(greatest(coalesce(position_seconds, 0), 0), greatest(video_duration, 0));

  INSERT INTO public.video_watch_progress (user_id, video_id, last_position_seconds, completed, updated_at)
  VALUES (viewer, target_video_id, safe_position, coalesce(did_complete, false), now())
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    last_position_seconds = EXCLUDED.last_position_seconds,
    completed = public.video_watch_progress.completed OR EXCLUDED.completed,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.save_video_watch_progress(uuid, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_video_watch_progress(uuid, integer, boolean) TO authenticated;

-- Anonymous activity is not collected. Signed-in viewers can opt in through app settings.
CREATE TABLE IF NOT EXISTS public.video_viewing_insights (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  watched_seconds integer NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  completed boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, video_id)
);
ALTER TABLE public.video_viewing_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "read_own_viewing_insights" ON public.video_viewing_insights;
CREATE POLICY "read_own_viewing_insights" ON public.video_viewing_insights
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_viewing_insights" ON public.video_viewing_insights;
CREATE POLICY "delete_own_viewing_insights" ON public.video_viewing_insights
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_video_viewing_insights_updated_at
  ON public.video_viewing_insights (updated_at);

CREATE OR REPLACE FUNCTION public.record_video_viewing_insight(
  target_video_id uuid,
  session_watched_seconds integer,
  did_complete boolean DEFAULT false,
  did_skip boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  viewer uuid := auth.uid();
  insights_allowed boolean := false;
  video_is_public boolean := false;
BEGIN
  IF viewer IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF session_watched_seconds IS NULL OR session_watched_seconds < 1 OR session_watched_seconds > 600 THEN
    RAISE EXCEPTION 'Invalid viewing summary';
  END IF;
  SELECT viewing_insights INTO insights_allowed FROM public.profiles WHERE id = viewer;
  IF NOT coalesce(insights_allowed, false) THEN RETURN; END IF;
  -- Enforce the 90-day retention target opportunistically without a pg_cron dependency.
  DELETE FROM public.video_viewing_insights
    WHERE updated_at < now() - interval '90 days';
  SELECT EXISTS (
    SELECT 1 FROM public.videos
    WHERE id = target_video_id AND is_active = true
      AND status IN ('published', 'ready') AND visibility = 'public'
  ) INTO video_is_public;
  IF NOT video_is_public THEN RAISE EXCEPTION 'Video is unavailable'; END IF;
  INSERT INTO public.video_viewing_insights (user_id, video_id, watched_seconds, completed, skipped, updated_at)
    VALUES (viewer, target_video_id, session_watched_seconds,
      coalesce(did_complete, false), coalesce(did_skip, false), now())
  ON CONFLICT (user_id, video_id) DO UPDATE SET
    watched_seconds = public.video_viewing_insights.watched_seconds + EXCLUDED.watched_seconds,
    completed = public.video_viewing_insights.completed OR EXCLUDED.completed,
    skipped = public.video_viewing_insights.skipped OR EXCLUDED.skipped,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_video_viewing_insight(uuid, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_video_viewing_insight(uuid, integer, boolean, boolean) TO authenticated;
