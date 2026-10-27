import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Transcoder } from './transcoder.js';
import { StorageService } from './storage.js';
import type { WorkerConfig } from './config.js';

export interface VideoRecord {
  id: string;
  title: string;
  video_url: string;
  raw_video_url?: string | null;
  status: string;
}

export class JobQueue {
  private supabase: SupabaseClient;
  private transcoder: Transcoder;
  private storage: StorageService;
  private isProcessing = false;

  constructor(private config: WorkerConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    this.transcoder = new Transcoder(config.ffmpegPath, config.ffprobePath);
    this.storage = new StorageService(
      config.supabaseUrl,
      config.supabaseServiceRoleKey,
      config.storageBucket,
      config.cdnBaseUrl
    );
  }

  /**
   * Fetch the next available video job
   */
  async fetchNextJob(): Promise<VideoRecord | null> {
    const { data, error } = await this.supabase
      .from('videos')
      .select('id, title, video_url, raw_video_url, status')
      .eq('status', 'uploaded')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(`[${this.config.workerId}] Error polling for jobs:`, error.message);
      return null;
    }

    return data as VideoRecord | null;
  }

  /**
   * Process a single video record through the pipeline
   */
  async processJob(job: VideoRecord): Promise<void> {
    const videoId = job.id;
    console.log(`[${this.config.workerId}] Claiming job for video: ${videoId} ("${job.title}")`);

    // 1. Mark as processing
    const { error: claimError } = await this.supabase
      .from('videos')
      .update({ status: 'processing', error_message: null })
      .eq('id', videoId)
      .eq('status', 'uploaded');

    if (claimError) {
      console.error(`[${this.config.workerId}] Failed to claim job ${videoId}:`, claimError.message);
      return;
    }

    const jobTempDir = path.join(this.config.tempDir, videoId);
    const sourceFilePath = path.join(jobTempDir, 'source.mp4');
    const outputDir = path.join(jobTempDir, 'hls_output');

    try {
      await fs.mkdir(jobTempDir, { recursive: true });

      const rawSource = job.raw_video_url || job.video_url;
      console.log(`[${this.config.workerId}] Downloading raw source from ${rawSource}...`);
      await this.storage.downloadRawVideo(rawSource, sourceFilePath);

      console.log(`[${this.config.workerId}] Transcoding video into 240p, 360p, 480p, 720p ABR ladder (2s segments)...`);
      const transcodeResult = await this.transcoder.processVideo(sourceFilePath, outputDir);

      console.log(`[${this.config.workerId}] Uploading HLS segments and poster to storage...`);
      const urls = await this.storage.uploadTranscodedAssets(videoId, outputDir);

      const finalMasterUrl = urls.cdnMasterM3u8Url || urls.masterM3u8Url;
      const finalPosterUrl = urls.cdnPosterUrl || urls.posterUrl;
      const resolutionNames = transcodeResult.variants.map((v) => v.name);

      console.log(`[${this.config.workerId}] Transcoding succeeded! Final master URL: ${finalMasterUrl}`);

      // 4. Update database to pending_review (mandatory manual review before publishing)
      const { error: updateError } = await this.supabase
        .from('videos')
        .update({
          status: 'pending_review',
          is_active: false,
          video_url: finalMasterUrl,
          hls_master_url: finalMasterUrl,
          thumbnail_url: finalPosterUrl,
          duration_seconds: transcodeResult.duration,
          resolutions: resolutionNames,
          aspect_ratio: transcodeResult.dimensions.aspectRatio,
          error_message: null,
        })
        .eq('id', videoId);

      if (updateError) {
        throw new Error(`Failed to update video record to 'pending_review': ${updateError.message}`);
      }

      console.log(`[${this.config.workerId}] Video ${videoId} marked as PENDING_REVIEW (awaiting manual admin review).`);
    } catch (err) {
      const errMsg = (err as Error).message || 'Unknown transcoding error';
      console.error(`[${this.config.workerId}] Transcoding failed for ${videoId}:`, errMsg);

      await this.supabase
        .from('videos')
        .update({
          status: 'failed',
          error_message: errMsg.slice(0, 500),
        })
        .eq('id', videoId);
    } finally {
      // 5. Clean up temporary working directory
      await fs.rm(jobTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Main poll loop tick
   */
  async tick(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const job = await this.fetchNextJob();
      if (job) {
        await this.processJob(job);
      }
    } catch (err) {
      console.error(`[${this.config.workerId}] Error in queue tick:`, err);
    } finally {
      this.isProcessing = false;
    }
  }
}
