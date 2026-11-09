import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UploadScreen } from './UploadScreen';
import * as videoUploadModule from '@/services/videoUpload';
import { sessionService } from '@/services/session';

const insertMock = vi.fn().mockResolvedValue({ error: null });
const selectMock = vi.fn();

vi.mock('@/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { is_banned: false } }),
            })),
          })),
        };
      }
      if (table === 'videos') {
        return {
          insert: insertMock,
        };
      }
      return {};
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uploader-123' } } }),
    },
  },
  accountSupabase: null,
}));

vi.mock('@/services/session', () => ({
  sessionService: {
    getSnapshot: vi.fn(() => ({
      user: { id: 'uploader-123' },
      tier: 'free',
    })),
    getCsrfToken: vi.fn(() => 'csrf-token-123'),
  },
}));

describe('UploadScreen Component (Phase 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
    vi.spyOn(videoUploadModule, 'extractVideoMetadataAndThumbnail').mockResolvedValue({
      durationSeconds: 30,
      width: 1080,
      height: 1920,
      thumbnailBlob: null,
      thumbnailDataUrl: null,
    });
  });

  it('renders upload interface with mode toggles and visibility options', () => {
    render(<UploadScreen onUploaded={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Upload Video/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /File Upload/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Direct URL/i })).toBeInTheDocument();

    // Visibility buttons
    expect(screen.getByRole('button', { name: /Public/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Private/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /18\+ Only/i })).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: /Submit for Review/i })).toBeInTheDocument();
  });

  it('allows submitting a video via Direct URL mode', async () => {
    const onUploaded = vi.fn();
    render(<UploadScreen onUploaded={onUploaded} />);

    // Switch to Direct URL mode
    fireEvent.click(screen.getByRole('button', { name: /Direct URL/i }));

    // Fill title and URL
    const titleInput = screen.getByPlaceholderText(/Give your video a catchy title/i);
    fireEvent.change(titleInput, { target: { value: 'Accra Street Dance #viral' } });

    const urlInput = screen.getByPlaceholderText(/https:\/\/cdn.example.com\/video.mp4/i);
    fireEvent.change(urlInput, { target: { value: 'https://cdn.example.com/street-dance.mp4' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Submit for Review/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Accra Street Dance #viral',
          video_url: 'https://cdn.example.com/street-dance.mp4',
          raw_video_url: 'https://cdn.example.com/street-dance.mp4',
          status: 'uploaded',
          is_active: false,
          tags: ['viral'],
          uploader_id: 'uploader-123',
        })
      );
    });

    expect(screen.getByText(/Submitted for Review!/i)).toBeInTheDocument();
  });

  it('handles file selection, displays file details, and allows custom poster selection', async () => {
    vi.spyOn(videoUploadModule, 'extractVideoMetadataAndThumbnail').mockResolvedValue({
      durationSeconds: 45,
      width: 1080,
      height: 1920,
      thumbnailBlob: null,
      thumbnailDataUrl: null,
    });

    const { container } = render(<UploadScreen onUploaded={vi.fn()} />);

    // Simulate selecting an MP4 video file
    const file = new File(['dummy video data'], 'pulse_vibes.mp4', { type: 'video/mp4' });
    const fileInput = container.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('pulse_vibes.mp4')).toBeInTheDocument();
    });

    // Custom poster picker is present with empty thumbnail
    expect(screen.getByText(/Upload custom poster/i)).toBeInTheDocument();

    // Select custom poster image
    const posterInput = container.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
    const posterFile = new File(['custom poster bytes'], 'custom_cover.png', { type: 'image/png' });
    fireEvent.change(posterInput, { target: { files: [posterFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Custom cover ready/i)).toBeInTheDocument();
      expect(screen.getByText(/Change cover/i)).toBeInTheDocument();
    });
  });

  it('displays visual progress bar during file upload and executes signed submission', async () => {
    vi.spyOn(videoUploadModule, 'extractVideoMetadataAndThumbnail').mockResolvedValueOnce({
      durationSeconds: 30,
      width: 1080,
      height: 1920,
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
      thumbnailDataUrl: 'data:image/jpeg;base64,mockthumb',
    });

    let reportProgress: ((p: videoUploadModule.UploadProgress) => void) | undefined;
    vi.spyOn(videoUploadModule, 'uploadVideoFile').mockImplementation(async (_file, options) => {
      if (typeof options === 'object' && options?.onProgress) {
        reportProgress = options.onProgress;
        reportProgress({ percentage: 45, loadedBytes: 4500000, totalBytes: 10000000 });
      }
      return { url: 'https://cdn.pulse.video/raw/video.mp4', path: 'raw/video.mp4' };
    });

    vi.spyOn(videoUploadModule, 'extractVideoMetadataAndThumbnail').mockResolvedValue({
      durationSeconds: 30,
      width: 720,
      height: 1280,
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
      thumbnailDataUrl: 'data:image/jpeg;base64,mock',
    });
    vi.spyOn(videoUploadModule, 'uploadThumbnailBlob').mockResolvedValue('https://cdn.pulse.video/posters/thumb.jpg');

    const { container } = render(<UploadScreen onUploaded={vi.fn()} />);

    const file = new File(['mock content'], 'party.mp4', { type: 'video/mp4' });
    const fileInput = container.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('party.mp4')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Give your video a catchy title/i)).toHaveValue('Party');
    });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Submit for Review/i });
    fireEvent.click(submitBtn);

    // Progress bar should be displayed
    await waitFor(() => {
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '45');
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Party',
          video_url: 'https://cdn.pulse.video/raw/video.mp4',
          thumbnail_url: 'https://cdn.pulse.video/posters/thumb.jpg',
          status: 'uploaded',
        })
      );
    });
  });

  it('supports cancellation during active upload and resets progress gracefully', async () => {
    let cancelSignal: AbortSignal | undefined;
    vi.spyOn(videoUploadModule, 'uploadVideoFile').mockImplementation(async (_file, options) => {
      if (typeof options === 'object') {
        cancelSignal = options?.signal;
        options?.onProgress?.({ percentage: 30, loadedBytes: 3000000, totalBytes: 10000000 });
      }
      return new Promise((_, reject) => {
        cancelSignal?.addEventListener('abort', () => {
          reject(new DOMException('Upload aborted by user', 'AbortError'));
        });
      });
    });

    const { container } = render(<UploadScreen onUploaded={vi.fn()} />);

    const file = new File(['mock content'], 'summer.mp4', { type: 'video/mp4' });
    const fileInput = container.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('summer.mp4')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Give your video a catchy title/i)).toHaveValue('Summer');
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit for Review/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel Upload/i })).toBeInTheDocument();
    });

    // Click Cancel Upload
    fireEvent.click(screen.getByRole('button', { name: /Cancel Upload/i }));

    await waitFor(() => {
      expect(screen.getByText(/Upload cancelled\./i)).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    // The selected file is retained for retry
    expect(screen.getByText('summer.mp4')).toBeInTheDocument();
  });

  it('displays clear error with a Retry Upload button on network failure', async () => {
    vi.spyOn(videoUploadModule, 'uploadVideoFile').mockRejectedValueOnce(
      new Error('Network error: connection reset')
    );

    const { container } = render(<UploadScreen onUploaded={vi.fn()} />);

    const file = new File(['mock content'], 'dance.mp4', { type: 'video/mp4' });
    const fileInput = container.querySelector('input[type="file"][accept*="video"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('dance.mp4')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Give your video a catchy title/i)).toHaveValue('Dance');
    });

    fireEvent.click(screen.getByRole('button', { name: /Submit for Review/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network error: connection reset/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry Upload/i })).toBeInTheDocument();
    });
  });
});
