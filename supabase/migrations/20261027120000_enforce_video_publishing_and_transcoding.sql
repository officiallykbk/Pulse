-- Migration: Enforce Video Publishing, Server-Controlled Transcoding, and Atomic Worker Locking

-- 1. Ensure foreign key constraint between videos and profiles for PostgREST joins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_videos_profiles' AND table_name = 'videos'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT fk_videos_profiles
      FOREIGN KEY (uploader_id)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Add worker distributed queue & lease columns to videos
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS locked_by text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_videos_queue_claim 
  ON public.videos (status, created_at) 
  WHERE status IN ('uploaded', 'processing');

-- 3. Atomic RPC function to claim a video transcoding job safely across multiple workers
CREATE OR REPLACE FUNCTION public.claim_video_job(p_worker_id text)
RETURNS SETOF public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_video_id uuid;
BEGIN
  -- Select one available job using FOR UPDATE SKIP LOCKED
  -- A job is eligible if it is:
  --  a) status = 'uploaded' and attempt_count < 3
  --  b) status = 'processing' but lease expired (no heartbeat for 15 minutes) and attempt_count < 3
  SELECT id INTO v_video_id
  FROM public.videos
  WHERE (
    (status = 'uploaded')
    OR (status = 'processing' AND COALESCE(heartbeat_at, locked_at) < (NOW() - INTERVAL '15 minutes'))
  )
  AND attempt_count < 3
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_video_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.videos
    SET status = 'processing',
        locked_by = p_worker_id,
        locked_at = NOW(),
        heartbeat_at = NOW(),
        attempt_count = attempt_count + 1,
        error_message = NULL
    WHERE id = v_video_id
    RETURNING *;
  END IF;
END;
$$;

-- 4. Heartbeat RPC function for active transcoding workers
CREATE OR REPLACE FUNCTION public.heartbeat_video_job(p_video_id uuid, p_worker_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated boolean := false;
BEGIN
  UPDATE public.videos
  SET heartbeat_at = NOW()
  WHERE id = p_video_id
    AND locked_by = p_worker_id
    AND status = 'processing';
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- 5. Video creation trigger: prevent client from inserting self-ready or active videos
CREATE OR REPLACE FUNCTION public.enforce_video_upload_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Authenticated clients cannot self-mark videos as ready/published directly in the feed
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.status NOT IN ('uploaded', 'uploading', 'pending_review') THEN
      NEW.status := 'uploaded';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_video_upload_defaults ON public.videos;
CREATE TRIGGER trg_enforce_video_upload_defaults
  BEFORE INSERT ON public.videos
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_video_upload_defaults();
