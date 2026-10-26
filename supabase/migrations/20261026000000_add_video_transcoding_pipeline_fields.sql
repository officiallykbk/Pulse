/*
# Add video transcoding pipeline fields

## Overview
Adds support for asynchronous video processing pipeline (Oracle Cloud Always-Free FFmpeg Worker).
Existing videos remain with status 'ready' so there is zero downtime.

## New Columns on `videos`:
- `status`: 'uploading' | 'uploaded' | 'processing' | 'ready' | 'failed' (default 'ready')
- `hls_master_url`: direct URL to master.m3u8 ABR playlist
- `raw_video_url`: original source video uploaded by the client
- `resolutions`: available resolutions (e.g. ['240p', '360p', '480p', '720p'])
- `aspect_ratio`: video aspect ratio (default '9:16')
- `error_message`: failure reason if transcoding fails
*/

ALTER TABLE videos 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready' 
    CHECK (status IN ('uploading', 'uploaded', 'processing', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS hls_master_url text,
  ADD COLUMN IF NOT EXISTS raw_video_url text,
  ADD COLUMN IF NOT EXISTS resolutions text[] DEFAULT ARRAY['720p'],
  ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '9:16',
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status) WHERE status IN ('uploaded', 'processing');
