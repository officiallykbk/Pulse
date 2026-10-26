import { useState } from 'react';
import { Flag, Share2, Download, Info, X, Eye, Calendar, Heart, ChevronLeft } from 'lucide-react';
import type { Video } from '@/types';

interface VideoOptionsSheetProps {
  video: Video;
  open: boolean;
  onClose: () => void;
  onShare: () => void;
  onReport: (reason: string) => void;
}

const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'other', label: 'Something else' },
];

export function VideoOptionsSheet({ video, open, onClose, onShare, onReport }: VideoOptionsSheetProps) {
  const [reportMenuOpen, setReportMenuOpen] = useState(false);

  if (!open) return null;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-md rounded-t-2xl bg-surface-raised px-4 pt-3 pb-8"
        style={{ animation: 'slideUp 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-4 w-4 text-white/60" />
        </button>

        <div className="mb-4 flex gap-3">
          <div className="h-20 w-32 flex-shrink-0 overflow-hidden rounded-md bg-surface-elevated">
            {video.thumbnail_url ? (
              <img src={video.thumbnail_url} alt={video.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Eye className="h-6 w-6 text-white/20" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <h3 className="text-sm font-semibold text-white">{video.title}</h3>
            {video.description && (
              <p className="mt-1 line-clamp-2 text-xs text-white/50">{video.description}</p>
            )}
          </div>
        </div>

        <div className="mb-4 flex items-center gap-4 rounded-lg bg-surface-elevated px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5 text-white/40" />
            <span className="text-xs text-white/60">{formatCount(video.view_count)} views</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-white/40" />
            <span className="text-xs text-white/60">{formatCount(video.like_count)} likes</span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-white/40" />
            <span className="text-xs text-white/60">{formatDate(video.created_at)}</span>
          </div>
        </div>

        {reportMenuOpen ? (
          <div className="space-y-1">
            <button
              onClick={() => setReportMenuOpen(false)}
              className="mb-2 flex items-center gap-2 text-sm text-white/60 transition-colors active:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-white/40">
              Why are you reporting this video?
            </p>
            {REPORT_REASONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => {
                  onReport(value);
                  setReportMenuOpen(false);
                  onClose();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
              >
                <Flag className="h-5 w-5 text-white/70" />
                <span className="text-sm text-white">{label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-1">
          <button
            onClick={() => {
              onShare();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <Share2 className="h-5 w-5 text-white/70" />
            <span className="text-sm text-white">Share</span>
          </button>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(video.video_url).catch(() => {});
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <Download className="h-5 w-5 text-white/70" />
            <span className="text-sm text-white">Copy video link</span>
          </button>

          <button
            onClick={() => {
              setReportMenuOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <Flag className="h-5 w-5 text-white/70" />
            <span className="text-sm text-white">Report video</span>
          </button>

          <button
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <Info className="h-5 w-5 text-white/70" />
            <span className="text-sm text-white/60">Close</span>
          </button>
          </div>
        )}
      </div>
    </div>
  );
}
