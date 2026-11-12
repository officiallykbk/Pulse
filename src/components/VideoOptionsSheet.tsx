import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, ChevronLeft, Flag, Link, Send, X } from 'lucide-react';
import type { Video } from '@/types';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { toast } from 'sonner';

interface VideoOptionsSheetProps {
  video: Video;
  open: boolean;
  saved: boolean;
  saving: boolean;
  shareCount: number;
  shareUrl: string;
  onClose: () => void;
  onSave: () => void;
  onShare: () => void;
  onReport: (reason: string) => void;
}

const REPORT_REASONS = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or misleading' },
  { value: 'copyright', label: 'Copyright violation' },
  { value: 'other', label: 'Something else' },
];

export function VideoOptionsSheet({
  video,
  open,
  saved,
  saving,
  shareCount,
  shareUrl,
  onClose,
  onSave,
  onShare,
  onReport,
}: VideoOptionsSheetProps) {
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleClose = () => {
    setReportMenuOpen(false);
    onClose();
  };

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace('.0', '')}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace('.0', '')}K`;
    return String(n);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Video link copied');
      handleClose();
    } catch {
      toast.error('Could not copy the video link');
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      role="presentation"
    >
      <button type="button" aria-label="Close share sheet" onClick={handleClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface-raised px-4 pt-3"
        style={{
          animation: 'slideUp 0.25s ease-out',
          paddingBottom: 'max(2rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />

        <button
          ref={closeButtonRef}
          onClick={handleClose}
          aria-label="Close share sheet"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-4 w-4 text-white/60" />
        </button>

        <div className="mb-4 pr-10">
          <h2 id="share-sheet-title" className="text-base font-bold text-white">Share this video</h2>
          <p className="mt-0.5 text-xs text-white/45">Send it on or copy a public link.</p>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl bg-surface-elevated p-3">
          <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-black">
            {video.thumbnail_url ? (
              <img src={resolveMediaUrl(video.thumbnail_url)} alt={video.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-lg font-black text-white/25">P</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-white">{video.title}</h3>
            {video.description && (
              <p className="mt-1 line-clamp-1 text-xs text-white/45">{video.description}</p>
            )}
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
                  handleClose();
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
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                onShare();
                handleClose();
              }}
              className="flex min-h-[82px] flex-col items-start justify-between rounded-xl border border-white/10 bg-white p-3 text-left text-black transition active:scale-[0.98]"
            >
              <Send className="h-6 w-6 fill-black" />
              <span className="text-sm font-semibold">Share · {formatCount(shareCount)}</span>
            </button>

            <button
              onClick={() => void handleCopyLink()}
              aria-label="Copy video link"
              className="flex min-h-[82px] flex-col items-start justify-between rounded-xl border border-white/10 bg-surface-elevated p-3 text-left text-white transition active:scale-[0.98]"
            >
              <Link className="h-6 w-6" />
              <span className="text-sm font-semibold">Copy link</span>
            </button>
          </div>

          <button
            onClick={() => {
              onSave();
              handleClose();
            }}
            disabled={saving}
            aria-label={saved ? 'Remove from Saved' : 'Save video'}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <Bookmark className={`h-5 w-5 text-white/70 ${saved ? 'fill-white' : ''}`} />
            <span className="text-sm text-white">{saved ? 'Remove from Saved' : 'Save video'}</span>
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
            onClick={handleClose}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 transition-colors active:bg-surface-elevated"
          >
            <X className="h-5 w-5 text-white/70" />
            <span className="text-sm text-white/60">Close</span>
          </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
