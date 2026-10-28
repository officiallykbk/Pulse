import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import type { WorkerConfig } from '../config.js';

const mockSupabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  storage: {
    from: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: mockSupabase.rpc,
    from: mockSupabase.from,
    storage: mockSupabase.storage,
  })),
}));

import { StorageService } from '../storage.js';
import { JobQueue, type VideoRecord } from '../queue.js';

describe('Oracle Worker Queue and Storage Characterization', () => {
  let tempTestDir: string;

  const config: WorkerConfig = {
    supabaseUrl: 'https://test.supabase.co',
    supabaseServiceRoleKey: 'test-service-key',
    storageBucket: 'videos',
    cdnBaseUrl: 'https://cdn.pulse.video',
    workerId: 'worker-unit-test-1',
    pollIntervalMs: 5000,
    concurrency: 1,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    tempDir: '/tmp/pulse_test',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    tempTestDir = path.join(os.tmpdir(), `pulse_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tempTestDir, { recursive: true });
    await fs.writeFile(path.join(tempTestDir, 'master.m3u8'), '#EXTM3U');
    await fs.writeFile(path.join(tempTestDir, 'poster.webp'), 'fake-poster-bytes');
  });

  afterEach(async () => {
    await fs.rm(tempTestDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('StorageService', () => {
    it('downloads raw video from Supabase Storage when path is bucket-relative', async () => {
      const storageMock = {
        download: vi.fn().mockResolvedValue({
          data: {
            arrayBuffer: async () => new ArrayBuffer(8),
          },
          error: null,
        }),
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn((key: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/videos/${key}` },
        })),
      };
      mockSupabase.storage.from.mockReturnValue(storageMock);

      const service = new StorageService(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        config.storageBucket,
        config.cdnBaseUrl
      );

      const destFile = path.join(tempTestDir, 'downloaded.mp4');
      await service.downloadRawVideo('raw/video-123.mp4', destFile);

      expect(storageMock.download).toHaveBeenCalledWith('raw/video-123.mp4');
      const exists = await fs.stat(destFile).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // Verify uploading transcoded assets uses CDN URLs when configured
      const uploadResult = await service.uploadTranscodedAssets('vid-123', tempTestDir);
      expect(storageMock.upload).toHaveBeenCalledWith(
        'transcoded/vid-123/master.m3u8',
        expect.any(Buffer),
        expect.objectContaining({
          contentType: 'application/vnd.apple.mpegurl',
          cacheControl: '31536000',
        })
      );
      expect(uploadResult.masterM3u8Url).toContain('transcoded/vid-123/master.m3u8');
      expect(uploadResult.cdnMasterM3u8Url).toBe('https://cdn.pulse.video/transcoded/vid-123/master.m3u8');
      expect(uploadResult.cdnPosterUrl).toBe('https://cdn.pulse.video/transcoded/vid-123/poster.webp');
    });

    it('returns direct Supabase storage URLs when CDN base URL is not provided', async () => {
      const storageMock = {
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn((key: string) => ({
          data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/videos/${key}` },
        })),
      };
      mockSupabase.storage.from.mockReturnValue(storageMock);

      const service = new StorageService(
        config.supabaseUrl,
        config.supabaseServiceRoleKey,
        config.storageBucket,
        undefined
      );

      const uploadResult = await service.uploadTranscodedAssets('vid-456', tempTestDir);
      expect(uploadResult.masterM3u8Url).toBe(
        'https://test.supabase.co/storage/v1/object/public/videos/transcoded/vid-456/master.m3u8'
      );
      expect(uploadResult.cdnMasterM3u8Url).toBeUndefined();
    });
  });

  describe('JobQueue', () => {
    it('claims next job using claim_video_job RPC when available', async () => {
      const mockJob: VideoRecord = {
        id: 'vid-claim-1',
        title: 'Dance Challenge',
        video_url: 'raw/vid-claim-1.mp4',
        raw_video_url: 'raw/vid-claim-1.mp4',
        status: 'processing',
      };
      mockSupabase.rpc.mockResolvedValueOnce({ data: [mockJob], error: null });

      const queue = new JobQueue(config);
      const claimed = await queue.claimNextJob();

      expect(mockSupabase.rpc).toHaveBeenCalledWith('claim_video_job', {
        p_worker_id: config.workerId,
      });
      expect(claimed).toEqual(mockJob);
    });

    it('falls back to atomic direct query when RPC fails', async () => {
      mockSupabase.rpc.mockRejectedValueOnce(new Error('RPC function not found'));

      const mockCandidate = {
        id: 'vid-claim-fallback',
        title: 'Sunset Reel',
        video_url: 'raw/sunset.mp4',
        raw_video_url: null,
        status: 'uploaded',
        attempt_count: 0,
      };

      const selectMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockCandidate, error: null }),
        update: vi.fn().mockReturnThis(),
      };

      const updateMock = {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: [{ ...mockCandidate, status: 'processing' }],
          error: null,
        }),
      };

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'videos') {
          return {
            select: selectMock.select,
            eq: selectMock.eq,
            order: selectMock.order,
            limit: selectMock.limit,
            maybeSingle: selectMock.maybeSingle,
            update: vi.fn().mockReturnValue(updateMock),
          };
        }
        return {};
      });

      const queue = new JobQueue(config);
      const claimed = await queue.claimNextJob();

      expect(claimed?.id).toBe('vid-claim-fallback');
      expect(claimed?.status).toBe('processing');
    });

    it('returns null when no candidate jobs are pending', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: [], error: null });
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      const queue = new JobQueue(config);
      const claimed = await queue.claimNextJob();
      expect(claimed).toBeNull();
    });
  });
});
