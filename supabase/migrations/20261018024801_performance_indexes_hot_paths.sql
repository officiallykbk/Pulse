/*
# Performance indexes for hot query paths

1. Purpose
The app's most frequent queries were running without supporting indexes:
- The video feed lists active videos ordered by creation date (newest first).
- Search filters active videos by title/description pattern match.
- Comments, likes, follows, and reports all look up rows by user or video id.

Without indexes, every one of these scans the whole table. That is fine with
50 rows and a serious problem with 50,000. This migration adds the indexes
the application's actual query patterns need. It changes no data and removes
nothing.

2. New indexes
- videos (is_active, created_at DESC): feed listing, newest first, active only.
- videos (is_active) partial, on title/description text search: search uses
  pattern matching; a trigram index makes it index-backed instead of a scan.
- comments (video_id, created_at DESC): loading a video's comments.
- comments (user_id): "my comments" / user-scoped checks.
- likes (user_id, created_at DESC): "liked videos" feed.
- likes (video_id): like counts per video.
- follows (follower_id, created_at DESC): "following" list.
- follows (following_id): follower counts and follower lists.
- reports (video_id): reports for a given video.
- reports (reporter_id): reports by a given user.

3. Modified tables
- None. No columns added, removed, or changed.

4. Security
- None. Indexes do not change access rules.

5. Important notes
- Requires the pg_trgm extension for the trigram indexes; it is created
  here if missing (a standard Postgres extension, already available on
  Supabase).
- All index creations use IF NOT EXISTS, so this migration is safe to re-run.
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_videos_active_created
  ON public.videos (is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_videos_title_trgm
  ON public.videos USING gin (title gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_videos_description_trgm
  ON public.videos USING gin (description gin_trgm_ops)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_comments_video_created
  ON public.comments (video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_user
  ON public.comments (user_id);

CREATE INDEX IF NOT EXISTS idx_likes_user_created
  ON public.likes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_likes_video
  ON public.likes (video_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_created
  ON public.follows (follower_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follows_following
  ON public.follows (following_id);

CREATE INDEX IF NOT EXISTS idx_reports_video
  ON public.reports (video_id);

CREATE INDEX IF NOT EXISTS idx_reports_reporter
  ON public.reports (reporter_id);
