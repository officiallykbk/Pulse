-- Persistent, per-user helpful reactions for comments.
CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_comment_likes" ON public.comment_likes;
CREATE POLICY "public_read_comment_likes" ON public.comment_likes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_comment_like" ON public.comment_likes;
CREATE POLICY "insert_own_comment_like" ON public.comment_likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_comment_like" ON public.comment_likes;
CREATE POLICY "delete_own_comment_like" ON public.comment_likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON public.comment_likes (comment_id);

-- Fetch bounded, aggregated reaction state for the currently displayed comments.
CREATE OR REPLACE FUNCTION public.get_comment_reactions(comment_ids uuid[])
RETURNS TABLE (comment_id uuid, helpful_count bigint, viewer_liked boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF comment_ids IS NULL OR cardinality(comment_ids) > 50 THEN
    RAISE EXCEPTION 'At most 50 comment IDs may be requested';
  END IF;

  RETURN QUERY
  SELECT c.id,
         count(cl.user_id)::bigint,
         coalesce(bool_or(cl.user_id = auth.uid()), false)
  FROM public.comments c
  LEFT JOIN public.comment_likes cl ON cl.comment_id = c.id
  WHERE c.id = ANY(comment_ids)
  GROUP BY c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_comment_reactions(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_comment_reactions(uuid[]) TO anon, authenticated;
