import { supabase } from '@/services/supabase';

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  thumbnailBlob: Blob | null;
  thumbnailDataUrl: string | null;
}

export interface UploadProgress {
  percentage: number;
  loadedBytes: number;
  totalBytes: number;
}

export const MAX_VIDEO_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB limit
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 minutes max (TikTok audit MVP constraint)
export const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
];
export const ALLOWED_VIDEO_EXTENSIONS = ['mp4', 'webm'];

export function validateVideoFile(file: File): { valid: boolean; error: string | null } {
  if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb}MB). Maximum allowed video size is 100MB.`,
    };
  }

  // Check extension in case browser doesn't detect MIME type
  const ext = file.name.split('.').pop()?.toLowerCase();

  const typeMatches = ALLOWED_VIDEO_TYPES.includes(file.type);
  const extMatches = ext ? ALLOWED_VIDEO_EXTENSIONS.includes(ext) : false;

  if (!typeMatches && !extMatches) {
    return {
      valid: false,
      error: 'Unsupported file format. Only MP4 and WebM videos are supported.',
    };
  }

  return { valid: true, error: null };
}

export function validateVideoDuration(durationSeconds: number): { valid: boolean; error: string | null } {
  if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = Math.round(durationSeconds % 60);
    return {
      valid: false,
      error: `Video exceeds the maximum allowed duration of 10 minutes (${mins}m ${secs}s).`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Extracts duration, resolution, and a preview thumbnail frame from a client-side video file
 * using an off-screen HTML5 video element and canvas.
 */
export async function extractVideoMetadataAndThumbnail(file: File): Promise<VideoMetadata> {
  return new Promise((resolve) => {
    let settled = false;
    // eslint-disable-next-line prefer-const
    let timer: ReturnType<typeof setTimeout> | undefined;

    const safeResolve = (data: VideoMetadata) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(data);
    };

    // If running in an environment without DOM video/canvas (e.g. testing), return fallback
    if (typeof document === 'undefined' || !window.URL?.createObjectURL) {
      safeResolve({
        durationSeconds: 0,
        width: 0,
        height: 0,
        thumbnailBlob: null,
        thumbnailDataUrl: null,
      });
      return;
    }

    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
    } catch {
      safeResolve({
        durationSeconds: 0,
        width: 0,
        height: 0,
        thumbnailBlob: null,
        thumbnailDataUrl: null,
      });
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = objectUrl;
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      try {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore cleanup errors
      }
    };

    // Safety timeout: in headless/testing environments or corrupted files, resolve safely
    timer = setTimeout(() => {
      cleanup();
      safeResolve({
        durationSeconds: 0,
        width: 0,
        height: 0,
        thumbnailBlob: null,
        thumbnailDataUrl: null,
      });
    }, 400);

    video.onloadedmetadata = () => {
      const durationSeconds = Math.round(video.duration) || 0;

      // Seek to 1 second or midpoint to avoid leading black frames
      video.currentTime = Math.min(1.0, durationSeconds > 0 ? durationSeconds / 2 : 0);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          canvas.toBlob(
            (blob) => {
              cleanup();
              safeResolve({
                durationSeconds: Math.round(video.duration) || 0,
                width: video.videoWidth || 0,
                height: video.videoHeight || 0,
                thumbnailBlob: blob,
                thumbnailDataUrl: dataUrl,
              });
            },
            'image/jpeg',
            0.85
          );
          return;
        }
      } catch {
        // In case of canvas security or decoding issue, return what we have
      }
      cleanup();
      safeResolve({
        durationSeconds: Math.round(video.duration) || 0,
        width: video.videoWidth || 0,
        height: video.videoHeight || 0,
        thumbnailBlob: null,
        thumbnailDataUrl: null,
      });
    };

    video.onerror = () => {
      cleanup();
      safeResolve({
        durationSeconds: 0,
        width: 0,
        height: 0,
        thumbnailBlob: null,
        thumbnailDataUrl: null,
      });
    };
  });
}

/**
 * Uploads a video file to Supabase Storage with progress reporting.
 */
export async function uploadVideoFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ url: string; path: string }> {
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const fileName = `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
  const filePath = `raw/${fileName}`;

  // If onProgress is supplied, simulate or report progress via upload
  if (onProgress) {
    onProgress({ percentage: 10, loadedBytes: Math.round(file.size * 0.1), totalBytes: file.size });
  }

  const { error: uploadError } = await supabase.storage
  .from('videos')
  .upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Video upload failed: ${uploadError.message}`);
  }

  if (onProgress) {
    onProgress({ percentage: 100, loadedBytes: file.size, totalBytes: file.size });
  }

  const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(filePath);

  return {
    url: publicUrlData.publicUrl,
    path: filePath,
  };
}

/**
 * Uploads an extracted thumbnail frame to Supabase Storage.
 */
export async function uploadThumbnailBlob(
  blob: Blob,
  baseName = 'thumb'
): Promise<string> {
  const fileName = `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const filePath = `posters/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      cacheControl: '86400',
      upsert: false,
    });

  if (uploadError) {
    // Non-fatal, return empty if bucket isn't configured for posters
    console.warn('Thumbnail upload warning:', uploadError.message);
    return '';
  }

  const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(filePath);
  return publicUrlData.publicUrl;
}
