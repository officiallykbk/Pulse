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
  attempt_count?: number;
}

export class JobQueue {
  private supabase: SupabaseClient;
  private transcoder: Transcoder;
  private storage: StorageService;
  private activeJobs = new Set<string>();

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
   * Atomically claims the next available video job using PostgreSQL FOR UPDATE SKIP LOCKED
   * via the claim_video_job RPC, with an atomic fallback for direct query environments.
   */
  async claimNextJob(): Promise<VideoRecord | null> {
    try {
      // 1. Attempt atomic RPC claim (safe against race conditions across distributed workers)
      const { data: rpcData, error: rpcError } = await this.supabase.rpc('claim_video_job', {
        p_worker_id: this.config.workerId,
      });

      if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
        return rpcData[0] as VideoRecord;
      }
    } catch {
      // Fall through to atomic fallback query below
    }

    // 2. Atomic fallback: select one candidate, then update with strict status check & select()
    try {
      const { data: candidate } = await this.supabase
        .from('videos')
        .select('id, title, video_url, raw_video_url, status, attempt_count')
        .eq('status', 'uploaded')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!candidate) return null;

      const { data: claimed, error: claimError } = await this.supabase
        .from('videos')
        .update({
          status: 'processing',
          locked_by: this.config.workerId,
          locked_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', candidate.id)
        .eq('status', 'uploaded')
        .select('id, title, video_url, raw_video_url, status');

      if (claimError || !claimed || claimed.length === 0) {
        // Lost race to another worker
        return null;
      }

      return claimed[0] as VideoRecord;
    } catch (err) {
      console.error(`[${this.config.workerId}] Error claiming job:`, err);
      return null;
    }
  }

  /**
   * Process a single video record through the pipeline with heartbeats and lease management
   */
  async processJob(job: VideoRecord): Promise<void> {
    const videoId = job.id;
    console.log(`[${this.config.workerId}] Processing job for video: ${videoId} ("${job.title}")`);

    const jobTempDir = path.join(this.config.tempDir, videoId);
    const sourceFilePath = path.join(jobTempDir, 'source.mp4');
    const outputDir = path.join(jobTempDir, 'hls_output');

    // Start background heartbeat every 20 seconds so worker lease never expires
    const heartbeatTimer = setInterval(async () => {
      try {
        await this.supabase.rpc('heartbeat_video_job', {
          p_video_id: videoId,
          p_worker_id: this.config.workerId,
        });
      } catch {
        // Fallback update
        await this.supabase
          .from('videos')
          .update({ heartbeat_at: new Date().toISOString() })
          .eq('id', videoId)
          .eq('locked_by', this.config.workerId);
      }
    }, 20_000);

    try {
      await fs.mkdir(jobTempDir, { recursive: true });

      const rawSource = job.raw_video_url || job.video_url;
      console.log(`[${this.config.workerId}] Downloading raw source from ${rawSource}...`);
      await this.storage.downloadRawVideo(rawSource, sourceFilePath);

      console.log(`[${this.config.workerId}] Transcoding video into 240p, 360p, 480p, 720p ABR ladder in parallel...`);
      const transcodeResult = await this.transcoder.processVideo(sourceFilePath, outputDir);

      console.log(`[${this.config.workerId}] Uploading HLS segments and poster to storage...`);
      const urls = await this.storage.uploadTranscodedAssets(videoId, outputDir);

      const finalMasterUrl = urls.cdnMasterM3u8Url || urls.masterM3u8Url;
      const finalPosterUrl = urls.cdnPosterUrl || urls.posterUrl;
      const resolutionNames = transcodeResult.variants.map((v) => v.name);

      console.log(`[${this.config.workerId}] Transcoding succeeded! Final master URL: ${finalMasterUrl}`);

      // 4. Update database to ready
      const { error: updateError } = await this.supabase
        .from('videos')
        .update({
          status: 'ready',
          is_active: true,
          video_url: finalMasterUrl,
          hls_master_url: finalMasterUrl,
          thumbnail_url: finalPosterUrl,
          duration_seconds: transcodeResult.duration,
          resolutions: resolutionNames,
          aspect_ratio: transcodeResult.dimensions.aspectRatio,
          error_message: null,
          locked_by: null,
          locked_at: null,
          heartbeat_at: null,
        })
        .eq('id', videoId);

      if (updateError) {
        throw new Error(`Failed to update video record to 'ready': ${updateError.message}`);
      }

      console.log(`[${this.config.workerId}] Video ${videoId} marked as READY.`);
    } catch (err) {
      const errMsg = (err as Error).message || 'Unknown transcoding error';
      console.error(`[${this.config.workerId}] Transcoding failed for ${videoId}:`, errMsg);

      await this.supabase
        .from('videos')
        .update({
          status: 'failed',
          error_message: errMsg.slice(0, 500),
          locked_by: null,
          locked_at: null,
          heartbeat_at: null,
        })
        .eq('id', videoId);
    } finally {
      clearInterval(heartbeatTimer);
      // Clean up temporary working directory
      await fs.rm(jobTempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Main poll loop tick supporting bounded worker concurrency
   */
  async tick(): Promise<void> {
    const availableSlots = this.config.concurrency - this.activeJobs.size;
    if (availableSlots <= 0) return;

    for (let i = 0; i < availableSlots; i++) {
      const job = await this.claimNextJob();
      if (!job) break;

      this.activeJobs.add(job.id);
      this.processJob(job)
        .catch((err) => {
          console.error(`[${this.config.workerId}] Unhandled job error for ${job.id}:`, err);
        })
        .finally(() => {
          this.activeJobs.delete(job.id);
        });
    }
  }
}
