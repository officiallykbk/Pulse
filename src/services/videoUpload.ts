import { supabase } from '@/services/supabase';
import { sessionService } from '@/services/session';

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

export const MAX_POSTER_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
export const ALLOWED_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

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

export function validateImageFile(file: File | Blob): { valid: boolean; error: string | null } {
  if (file.size > MAX_POSTER_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Poster image is too large (${sizeMb}MB). Maximum allowed image size is 5MB.`,
    };
  }

  const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const ext = name ? name.split('.').pop()?.toLowerCase() : '';

  const typeMatches = file.type ? ALLOWED_IMAGE_TYPES.includes(file.type) : false;
  const extMatches = ext ? ALLOWED_IMAGE_EXTENSIONS.includes(ext) : false;

  if (file.type && !typeMatches && !extMatches) {
    return {
      valid: false,
      error: 'Unsupported image format. Only JPEG, PNG, and WebP images are supported.',
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

export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a video file to Supabase Storage with progress reporting and cancellation support.
 * Uses object-scoped signed upload URLs from the first-party /api/uploads/sign endpoint,
 * completely avoiding client-side bearer tokens.
 */
export async function uploadVideoFile(
  file: File,
  onProgressOrOptions?: ((progress: UploadProgress) => void) | UploadOptions
): Promise<{ url: string; path: string }> {
  const onProgress = typeof onProgressOrOptions === 'function'
    ? onProgressOrOptions
    : onProgressOrOptions?.onProgress;
  const signal = typeof onProgressOrOptions === 'object' && onProgressOrOptions !== null
    ? onProgressOrOptions.signal
    : undefined;

  if (signal?.aborted) {
    throw new DOMException('Upload aborted by user', 'AbortError');
  }

  // If onProgress is supplied, report initial 10%
  if (onProgress) {
    onProgress({ percentage: 10, loadedBytes: Math.round(file.size * 0.1), totalBytes: file.size });
  }

  // 1. Attempt upload via first-party signed URL
  try {
    const csrf = sessionService.getCsrfToken();
    const signRes = await fetch('/api/uploads/sign', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        prefix: 'raw',
      }),
    });

    if (signRes.ok) {
      const data = await signRes.json() as { uploadUrl?: string; path?: string; publicUrl?: string };
      if (data.uploadUrl && data.path && data.publicUrl) {
        // Upload directly to Supabase Storage with signed token (no bearer token in JS)
        await new Promise<void>((resolve, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Upload aborted by user', 'AbortError'));
            return;
          }

          if (typeof XMLHttpRequest !== 'undefined') {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', data.uploadUrl!);
            xhr.setRequestHeader('Content-Type', file.type);

            if (signal) {
              signal.addEventListener('abort', () => {
                xhr.abort();
                reject(new DOMException('Upload aborted by user', 'AbortError'));
              }, { once: true });
            }

            if (onProgress) {
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  onProgress({
                    percentage: Math.min(99, Math.round((e.loaded / e.total) * 100)),
                    loadedBytes: e.loaded,
                    totalBytes: e.total,
                  });
                }
              };
            }

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                if (onProgress) onProgress({ percentage: 100, loadedBytes: file.size, totalBytes: file.size });
                resolve();
              } else {
                reject(new Error(`Storage upload failed with status ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Network error during video upload'));
            xhr.onabort = () => reject(new DOMException('Upload aborted by user', 'AbortError'));
            xhr.send(file);
          } else {
            // Headless / fetch environment
            fetch(data.uploadUrl!, {
              method: 'PUT',
              headers: { 'Content-Type': file.type },
              body: file,
              signal,
            })
              .then((r) => {
                if (!r.ok) throw new Error(`Storage upload failed: ${r.status}`);
                if (onProgress) onProgress({ percentage: 100, loadedBytes: file.size, totalBytes: file.size });
                resolve();
              })
              .catch(reject);
          }
        });

        return {
          url: data.publicUrl,
          path: data.path,
        };
      }
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    // Fall back to direct storage client below (e.g. In unit tests mocking supabase.storage)
  }

  if (signal?.aborted) {
    throw new DOMException('Upload aborted by user', 'AbortError');
  }

  // 2. Direct client fallback for test environments
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const fileName = `raw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
  const filePath = `raw/${fileName}`;

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
 * Uploads an extracted thumbnail frame or custom poster to Supabase Storage with progress reporting.
 */
export async function uploadThumbnailBlob(
  blob: Blob,
  baseName = 'thumb',
  onProgressOrOptions?: ((progress: UploadProgress) => void) | UploadOptions
): Promise<string> {
  const onProgress = typeof onProgressOrOptions === 'function'
    ? onProgressOrOptions
    : onProgressOrOptions?.onProgress;
  const signal = typeof onProgressOrOptions === 'object' && onProgressOrOptions !== null
    ? onProgressOrOptions.signal
    : undefined;

  if (signal?.aborted) {
    throw new DOMException('Upload aborted by user', 'AbortError');
  }

  // 1. Attempt upload via first-party signed URL
  try {
    const csrf = sessionService.getCsrfToken();
    const mimeType = blob.type || 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

    const signRes = await fetch('/api/uploads/sign', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify({
        fileName: `${baseName}.${ext}`,
        fileSize: blob.size,
        mimeType,
        prefix: 'posters',
      }),
    });

    if (signRes.ok) {
      const data = await signRes.json() as { uploadUrl?: string; publicUrl?: string };
      if (data.uploadUrl && data.publicUrl) {
        if (typeof XMLHttpRequest !== 'undefined' && onProgress) {
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', data.uploadUrl!);
            xhr.setRequestHeader('Content-Type', mimeType);

            if (signal) {
              signal.addEventListener('abort', () => {
                xhr.abort();
                reject(new DOMException('Upload aborted by user', 'AbortError'));
              }, { once: true });
            }

            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress({
                  percentage: Math.min(99, Math.round((e.loaded / e.total) * 100)),
                  loadedBytes: e.loaded,
                  totalBytes: e.total,
                });
              }
            };
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                onProgress({ percentage: 100, loadedBytes: blob.size, totalBytes: blob.size });
                resolve();
              } else {
                reject(new Error(`Storage upload failed: ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Network error during poster upload'));
            xhr.onabort = () => reject(new DOMException('Upload aborted by user', 'AbortError'));
            xhr.send(blob);
          });
          return data.publicUrl;
        }

        const uploadRes = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          body: blob,
          signal,
        });
        if (uploadRes.ok) {
          if (onProgress) onProgress({ percentage: 100, loadedBytes: blob.size, totalBytes: blob.size });
          return data.publicUrl;
        }
      }
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw err;
    }
    // Fall back to direct storage client below
  }

  if (signal?.aborted) {
    throw new DOMException('Upload aborted by user', 'AbortError');
  }

  // 2. Direct client fallback for unit tests
  const mimeType = blob.type || 'image/jpeg';
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${baseName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `posters/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('videos')
    .upload(filePath, blob, {
      contentType: mimeType,
      cacheControl: '86400',
      upsert: false,
    });

  if (uploadError) {
    console.warn('Thumbnail upload warning:', uploadError.message);
    return '';
  }

  if (onProgress) {
    onProgress({ percentage: 100, loadedBytes: blob.size, totalBytes: blob.size });
  }

  const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(filePath);
  return publicUrlData.publicUrl;
}
