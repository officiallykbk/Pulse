import { useState, useRef } from 'react';
import { Upload, Check, AlertCircle, Film, Image as ImageIcon, Link2, X } from 'lucide-react';
import { supabase } from '@/services/supabase';
import {
  extractVideoMetadataAndThumbnail,
  uploadVideoFile,
  uploadThumbnailBlob,
  type UploadProgress,
} from '@/services/videoUpload';

interface UploadScreenProps {
  onUploaded: () => void;
}

type UploadMode = 'file' | 'url';

export function UploadScreen({ onUploaded }: UploadScreenProps) {
  const [mode, setMode] = useState<UploadMode>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [duration, setDuration] = useState('');

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null);
  const [thumbnailBlob, setThumbnailBlob] = useState<Blob | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setSelectedFile(file);
    setStatusMessage('Analyzing video & extracting preview...');

    try {
      const meta = await extractVideoMetadataAndThumbnail(file);
      if (meta.durationSeconds > 0) {
        setDuration(String(meta.durationSeconds));
      }
      if (meta.thumbnailDataUrl) {
        setPreviewThumbnail(meta.thumbnailDataUrl);
      }
      if (meta.thumbnailBlob) {
        setThumbnailBlob(meta.thumbnailBlob);
      }
      if (!title.trim()) {
        // Default title to filename without extension
        const autoTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTitle(autoTitle.charAt(0).toUpperCase() + autoTitle.slice(1));
      }
    } catch (err) {
      console.warn('Metadata extraction warning:', err);
    } finally {
      setStatusMessage(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewThumbnail(null);
    setThumbnailBlob(null);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (mode === 'url' && !videoUrl.trim()) return;
    if (mode === 'file' && !selectedFile && !videoUrl.trim()) {
      setError('Please select a video file or provide a video URL');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      let finalVideoUrl = videoUrl.trim();
      let finalThumbnailUrl = thumbnailUrl.trim() || null;

      // Execute direct file upload if file is selected
      if (mode === 'file' && selectedFile) {
        setStatusMessage('Uploading video file...');
        const { url: uploadedUrl } = await uploadVideoFile(selectedFile, (progress) => {
          setUploadProgress(progress);
        });
        finalVideoUrl = uploadedUrl;

        // Upload thumbnail if available
        if (thumbnailBlob) {
          setStatusMessage('Uploading thumbnail poster...');
          const uploadedPosterUrl = await uploadThumbnailBlob(thumbnailBlob);
          if (uploadedPosterUrl) {
            finalThumbnailUrl = uploadedPosterUrl;
          }
        }
      }

      setStatusMessage('Saving video details...');
      const { data: { user } } = await supabase.auth.getUser();

      const { error: insertError } = await supabase.from('videos').insert({
        title: title.trim(),
        description: description.trim() || null,
        video_url: finalVideoUrl,
        thumbnail_url: finalThumbnailUrl,
        duration_seconds: duration ? parseInt(duration, 10) : 0,
        uploader_id: user?.id ?? null,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      setSuccess(true);
      setTitle('');
      setDescription('');
      setVideoUrl('');
      setThumbnailUrl('');
      setDuration('');
      handleClearFile();

      setTimeout(() => {
        setSuccess(false);
        onUploaded();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="min-h-full bg-black px-4 pt-8 pb-24">
      <div className="mx-auto max-w-sm">
        <h1 className="mb-2 text-2xl font-bold text-white">Upload Video</h1>
        <p className="mb-6 text-xs text-white/50">Share short reels with the Pulse community</p>

        {/* Upload Mode Selector */}
        <div className="mb-6 flex rounded-xl bg-surface-raised p-1">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
              mode === 'file' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            File Upload
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
              mode === 'url' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <Link2 className="h-3.5 w-3.5" />
            Direct URL
          </button>
        </div>

        {success && (
          <div className="mb-4 flex items-center gap-3 rounded-card bg-success/15 px-4 py-3">
            <Check className="h-5 w-5 text-success" />
            <span className="text-sm font-medium text-success">Video uploaded successfully</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-3 rounded-card bg-error/15 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-error" />
            <span className="text-sm text-error">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'file' ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80">Video File</label>
              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/20 bg-surface-raised px-4 py-8 text-center transition-colors hover:border-accent hover:bg-white/[0.02]"
                >
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-white">Tap to select a video file</p>
                  <p className="mt-1 text-xs text-white/40">MP4, MOV, WebM (up to 500MB)</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-surface-raised p-3">
                  <div className="flex items-center gap-3">
                    {previewThumbnail ? (
                      <div className="relative h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-black">
                        <img
                          src={previewThumbnail}
                          alt="Video preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-16 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <Film className="h-6 w-6 text-white/40" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
                      <p className="text-xs text-white/50">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                        {duration ? ` • ${duration}s` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearFile}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {uploadProgress && (
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-[11px] text-white/60">
                        <span>Uploading...</span>
                        <span>{uploadProgress.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-accent transition-all duration-150"
                          style={{ width: `${uploadProgress.percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80">Video URL</label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                required={mode === 'url'}
                className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
                placeholder="https://cdn.example.com/video.mp4 or .m3u8"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
              placeholder="Give your video a catchy title"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
              placeholder="What is this video about? Add tags #pulse"
            />
          </div>

          {mode === 'url' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/80">Thumbnail URL</label>
                <input
                  type="url"
                  value={thumbnailUrl}
                  onChange={(e) => setThumbnailUrl(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
                  placeholder="https://cdn.example.com/poster.jpg"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/80">Duration (seconds)</label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
                  placeholder="30"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            <Upload className="h-5 w-5" />
            {submitting ? (statusMessage ?? 'Uploading...') : 'Upload Video'}
          </button>
        </form>
      </div>
    </div>
  );
}
