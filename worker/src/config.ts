import dotenv from 'dotenv';
import path from 'node:path';
import os from 'node:os';

dotenv.config();

export interface WorkerConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  storageBucket: string;
  cdnBaseUrl?: string;
  workerId: string;
  pollIntervalMs: number;
  concurrency: number;
  ffmpegPath: string;
  ffprobePath: string;
  tempDir: string;
}

export function loadConfig(): WorkerConfig {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    storageBucket: process.env.STORAGE_BUCKET_NAME || 'videos',
    cdnBaseUrl: process.env.CDN_BASE_URL?.replace(/\/+$/, ''),
    workerId: process.env.WORKER_ID || `worker-${os.hostname()}`,
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
    concurrency: parseInt(process.env.CONCURRENCY || '1', 10),
    ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
    ffprobePath: process.env.FFPROBE_PATH || 'ffprobe',
    tempDir: process.env.TEMP_DIR || path.join(os.tmpdir(), 'pulse_worker'),
  };
}
