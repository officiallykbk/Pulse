/*
# Pin trigger function search paths

1. Purpose
The two trigger functions created in the previous migration
(on_comment_created, on_comment_deleted) did not pin their search_path,
which the Supabase linter flags as a security warning (a role could
potentially influence schema resolution). This migration re-pins both
with SET search_path = '' so lookups are always schema-qualified.

2. Modified objects
- public.on_comment_created — search_path pinned
- public.on_comment_deleted — search_path pinned

3. Security
- Closes the linter warning; no access rules change. Triggers keep firing
  exactly as before.

4. Notes
- Idempotent (CREATE OR REPLACE).
*/

CREATE OR REPLACE FUNCTION public.on_comment_created()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
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
SET search_path = ''
AS $$
BEGIN
  UPDATE public.videos
  SET comment_count = GREATEST(comment_count - 1, 0)
  WHERE id = OLD.video_id;
  RETURN OLD;
END;
$$;
