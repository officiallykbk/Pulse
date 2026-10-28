import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  upload: vi.fn().mockResolvedValue({ error: null }),
  getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.pulse.video/test.mp4' } }),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mocks.upload,
        getPublicUrl: mocks.getPublicUrl,
      })),
    },
  },
}));

import {
  uploadVideoFile,
  uploadThumbnailBlob,
  extractVideoMetadataAndThumbnail,
  validateVideoFile,
  validateVideoDuration,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MAX_VIDEO_DURATION_SECONDS,
} from '@/services/videoUpload';

describe('videoUpload service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.pulse.video/test.mp4' } });
  });

  it('validates file size and allowed MIME types correctly (MP4 and WebM only)', () => {
    const validMp4 = new File(['small mp4'], 'sample.mp4', { type: 'video/mp4' });
    expect(validateVideoFile(validMp4).valid).toBe(true);

    const validWebm = new File(['small webm'], 'sample.webm', { type: 'video/webm' });
    expect(validateVideoFile(validWebm).valid).toBe(true);

    const oversizedFile = new File([''], 'huge.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversizedFile, 'size', { value: MAX_VIDEO_FILE_SIZE_BYTES + 1024 });
    const sizeResult = validateVideoFile(oversizedFile);
    expect(sizeResult.valid).toBe(false);
    expect(sizeResult.error).toContain('too large');

    // MOV is rejected in TikTok audit MVP (MP4/WebM only)
    const movFile = new File(['mov data'], 'clip.mov', { type: 'video/quicktime' });
    expect(validateVideoFile(movFile).valid).toBe(false);

    const invalidType = new File(['pdf data'], 'doc.pdf', { type: 'application/pdf' });
    const typeResult = validateVideoFile(invalidType);
    expect(typeResult.valid).toBe(false);
    expect(typeResult.error).toContain('Unsupported file format');
  });

  it('enforces maximum 10-minute duration limit', () => {
    expect(validateVideoDuration(60).valid).toBe(true);
    expect(validateVideoDuration(MAX_VIDEO_DURATION_SECONDS).valid).toBe(true);

    const overLimit = validateVideoDuration(MAX_VIDEO_DURATION_SECONDS + 15);
    expect(overLimit.valid).toBe(false);
    expect(overLimit.error).toContain('maximum allowed duration of 10 minutes');
  });

  it('gracefully extracts empty fallback metadata in headless test environment', async () => {
    const file = new File(['mock content'], 'test.mp4', { type: 'video/mp4' });
    const meta = await extractVideoMetadataAndThumbnail(file);
    expect(meta).toHaveProperty('durationSeconds');
    expect(meta).toHaveProperty('width');
    expect(meta).toHaveProperty('height');
  });

  it('uploads video file with progress tracking and returns public URL', async () => {
    const file = new File(['video bytes'], 'reel.mp4', { type: 'video/mp4' });
    const progressSpy = vi.fn();

    const result = await uploadVideoFile(file, progressSpy);
    expect(result.url).toBe('https://cdn.pulse.video/test.mp4');
    expect(result.path).toContain('raw/');
    expect(progressSpy).toHaveBeenCalledWith(expect.objectContaining({ percentage: 100 }));
  });

  it('uploads extracted thumbnail blob and returns poster URL', async () => {
    const blob = new Blob(['image bytes'], { type: 'image/jpeg' });
    const url = await uploadThumbnailBlob(blob, 'thumb');
    expect(url).toBe('https://cdn.pulse.video/test.mp4');
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringContaining('posters/thumb_'),
      blob,
      expect.objectContaining({ contentType: 'image/jpeg' })
    );
  });
});
