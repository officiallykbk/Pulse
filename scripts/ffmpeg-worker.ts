/**
 * Pulse Platform: Self-Hosted FFmpeg ABR Worker ($0 Cost)
 *
 * Runs on a free/low-cost VM (e.g. Oracle Cloud Always-Free ARM / Hetzner / VPS).
 * Polls or listens for videos in 'processing' status, creates the 4-tier
 * H.264 ABR ladder with 2-second HLS segments, uploads assets to storage,
 * and updates Supabase.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[Worker] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ProcessingVideo {
  id: string;
  video_url: string;
  title: string;
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}

async function processVideo(video: ProcessingVideo) {
  console.log(`[Worker] Starting transcoding for video ${video.id} ("${video.title}")...`);
  const workDir = path.join(os.tmpdir(), `pulse_job_${video.id}`);
  fs.mkdirSync(workDir, { recursive: true });

  const rawFilePath = path.join(workDir, 'input.mp4');
  const hlsOutputDir = path.join(workDir, 'hls');
  fs.mkdirSync(hlsOutputDir, { recursive: true });

  try {
    // 1. Download raw video file
    console.log(`[Worker] Downloading ${video.video_url}...`);
    const res = await fetch(video.video_url);
    if (!res.ok) throw new Error(`Failed to download raw video: ${res.statusText}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(rawFilePath, buffer);

    // 2. Extract poster thumbnail
    console.log('[Worker] Extracting poster thumbnail...');
    const posterPath = path.join(hlsOutputDir, 'poster.jpg');
    await runCommand('ffmpeg', [
      '-y',
      '-ss', '00:00:01',
      '-i', rawFilePath,
      '-vframes', '1',
      '-vf', 'scale=720:-1',
      '-q:v', '2',
      posterPath,
    ]);

    // 3. Transcode Multi-Bitrate H.264 ABR Ladder
    console.log('[Worker] Transcoding ABR ladder (240p, 360p, 480p, 720p)...');
    await runCommand('ffmpeg', [
      '-y',
      '-i', rawFilePath,
      '-filter_complex',
      '[0:v]split=4[v1][v2][v3][v4]; ' +
      '[v1]scale=w=426:h=240:force_original_aspect_ratio=decrease,pad=426:240:(ow-iw)/2:(oh-ih)/2[v1out]; ' +
      '[v2]scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2[v2out]; ' +
      '[v3]scale=w=854:h=480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2[v3out]; ' +
      '[v4]scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2[v4out]',
      '-map', '[v1out]', '-c:v:0', 'libx264', '-preset', 'fast', '-profile:v:0', 'baseline', '-b:v:0', '250k', '-maxrate:v:0', '300k', '-bufsize:v:0', '500k',
      '-map', '[v2out]', '-c:v:1', 'libx264', '-preset', 'fast', '-profile:v:1', 'main', '-b:v:1', '450k', '-maxrate:v:1', '550k', '-bufsize:v:1', '900k',
      '-map', '[v3out]', '-c:v:2', 'libx264', '-preset', 'fast', '-profile:v:2', 'main', '-b:v:2', '800k', '-maxrate:v:2', '950k', '-bufsize:v:2', '1600k',
      '-map', '[v4out]', '-c:v:3', 'libx264', '-preset', 'fast', '-profile:v:3', 'high', '-b:v:3', '1200k', '-maxrate:v:3', '1400k', '-bufsize:v:3', '2400k',
      '-map', '0:a?', '-c:a:0', 'aac', '-b:a:0', '64k',
      '-map', '0:a?', '-c:a:1', 'aac', '-b:a:1', '96k',
      '-map', '0:a?', '-c:a:2', 'aac', '-b:a:2', '128k',
      '-map', '0:a?', '-c:a:3', 'aac', '-b:a:3', '128k',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-master_pl_name', 'master.m3u8',
      '-hls_segment_filename', path.join(hlsOutputDir, 'stream_%v_seq%03d.ts'),
      '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3',
      path.join(hlsOutputDir, 'stream_%v.m3u8'),
    ]);

    // 4. Upload HLS files to storage
    console.log('[Worker] Uploading HLS chunks to storage...');
    const files = fs.readdirSync(hlsOutputDir);
    const destinationPrefix = `hls/${video.id}`;

    for (const f of files) {
      const filePath = path.join(hlsOutputDir, f);
      const fileData = fs.readFileSync(filePath);
      const contentType = f.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : f.endsWith('.ts')
        ? 'video/MP2T'
        : 'image/jpeg';

      await supabase.storage
        .from('videos')
        .upload(`${destinationPrefix}/${f}`, fileData, {
          contentType,
          cacheControl: '86400',
          upsert: true,
        });
    }

    const { data: masterUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(`${destinationPrefix}/master.m3u8`);
    const { data: posterUrlData } = supabase.storage
      .from('videos')
      .getPublicUrl(`${destinationPrefix}/poster.jpg`);

    // 5. Update database status to 'pending_review' (manual admin review required)
    console.log('[Worker] Marking video as pending_review...');
    await supabase
      .from('videos')
      .update({
        video_url: masterUrlData.publicUrl,
        thumbnail_url: posterUrlData.publicUrl,
        status: 'pending_review',
        is_active: false,
      })
      .eq('id', video.id);

    console.log(`[Worker] Successfully transcoded video ${video.id}! Marked pending_review. Master: ${masterUrlData.publicUrl}`);
  } catch (err) {
    console.error(`[Worker] Error transcoding video ${video.id}:`, err);
    await supabase
      .from('videos')
      .update({ status: 'failed' })
      .eq('id', video.id);
  } finally {
    // 6. Clean up temporary scratch directory
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function pollQueue() {
  try {
    const { data: videos, error } = await supabase
      .from('videos')
      .select('id, video_url, title')
      .eq('status', 'processing')
      .limit(1);

    if (error) {
      console.warn('[Worker] Polling error:', error.message);
      return;
    }

    if (videos && videos.length > 0) {
      await processVideo(videos[0]);
    }
  } catch (err) {
    console.error('[Worker] Polling loop error:', err);
  }
}

console.log(`[Worker] Pulse FFmpeg Transcoder Daemon started. Polling every ${POLL_INTERVAL_MS}ms...`);
setInterval(pollQueue, POLL_INTERVAL_MS);
