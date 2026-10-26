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

import { uploadVideoFile, uploadThumbnailBlob, extractVideoMetadataAndThumbnail } from '@/services/videoUpload';

describe('videoUpload service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.pulse.video/test.mp4' } });
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
