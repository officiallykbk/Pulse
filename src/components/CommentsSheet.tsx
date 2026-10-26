import { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, MessageCircle } from 'lucide-react';
import { useComments } from '@/hooks/useComments';
import { supabase } from '@/services/supabase';

interface CommentsSheetProps {
  videoId: string;
  open: boolean;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

export function CommentsSheet({ videoId, open, onClose }: CommentsSheetProps) {
  const { comments, loading, posting, postComment, deleteComment } = useComments(videoId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setText('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    const { error: err } = await postComment(text);
    if (err) {
      setError(err);
    } else {
      setText('');
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl bg-surface-raised"
        style={{ animation: 'slideUp 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 mb-2 h-1 w-10 rounded-full bg-white/20" />

        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-white/70" />
            <h3 className="text-base font-semibold text-white">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors active:bg-white/20"
          >
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          )}

          {!loading && comments.length === 0 && (
            <div className="py-8 text-center">
              <MessageCircle className="mx-auto mb-2 h-8 w-8 text-white/15" />
              <p className="text-sm text-white/40">No comments yet</p>
              <p className="mt-1 text-xs text-white/25">Be the first to comment</p>
            </div>
          )}

          {!loading && comments.length > 0 && (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-surface-elevated">
                    <span className="text-xs font-bold text-white/40">
                      {comment.user_id.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white/60">
                        User {comment.user_id.slice(0, 6)}
                      </span>
                      <span className="text-[10px] text-white/30">{timeAgo(comment.created_at)}</span>
                      {currentUserId === comment.user_id && (
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="ml-auto text-white/30 transition-colors active:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-white/80">{comment.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-4 py-3">
          {error && (
            <p className="mb-2 text-xs text-error">{error}</p>
          )}
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Add a comment..."
              className="flex-1 rounded-full bg-surface-elevated px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={posting || !text.trim()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent transition-colors active:bg-accent-hover disabled:opacity-30"
            >
              <Send className="h-4 w-4 text-white" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
