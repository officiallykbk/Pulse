import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Flag,
  Heart,
  MoreHorizontal,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  VolumeX,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { GeneratedAvatar } from '@/components/GeneratedAvatar';
import { useComments, type CommentWithAuthor } from '@/hooks/useComments';
import { supabase } from '@/services/supabase';

interface CommentsSheetProps {
  videoId: string;
  open: boolean;
  onClose: () => void;
  onCommentCountChange?: (delta: number) => void;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

function CommentAvatar({ comment }: { comment: CommentWithAuthor }) {
  return (
    <div className="relative h-9 w-9 shrink-0">
      <GeneratedAvatar name={comment.author.display_name} className="h-9 w-9 text-[11px]" />
      {comment.author.avatar_url && (
        <img
          src={comment.author.avatar_url}
          alt=""
          className="absolute inset-0 h-9 w-9 rounded-full object-cover ring-1 ring-white/10"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
    </div>
  );
}

function CommentSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 py-4" aria-hidden="true">
      <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.08]" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="h-3 w-24 rounded-full bg-white/[0.08]" />
          <div className="h-2.5 w-12 rounded-full bg-white/[0.06]" />
        </div>
        <div className="h-3 w-11/12 rounded-full bg-white/[0.07]" />
        <div className="h-3 w-2/3 rounded-full bg-white/[0.07]" />
      </div>
    </div>
  );
}

export function CommentsSheet({
  videoId,
  open,
  onClose,
  onCommentCountChange,
}: CommentsSheetProps) {
  const {
    comments,
    loading,
    posting,
    error: loadError,
    postComment,
    deleteComment,
    toggleHelpful,
    refetch,
  } = useComments(videoId, open);
  const [text, setText] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isBanned, setIsBanned] = useState(false);
  const [banReason, setBanReason] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<CommentWithAuthor | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [mutedAuthorIds, setMutedAuthorIds] = useState<Set<string>>(() => new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reactionPendingIds, setReactionPendingIds] = useState<Set<string>>(() => new Set());
  const postingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    setCurrentUserId(null);
    setIsBanned(false);
    setBanReason(null);
    let active = true;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      setCurrentUserId(user?.id ?? null);
      if (user && typeof supabase.from === 'function') {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_banned, ban_reason')
          .eq('id', user.id)
          .maybeSingle();
        if (active && profile?.is_banned) {
          setIsBanned(true);
          setBanReason(profile.ban_reason || null);
        }
      }
    });

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      active = false;
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setText('');
      setComposerError(null);
      setConfirmDeleteId(null);
      setDeletingId(null);
      setReplyTo(null);
      setActionMenuId(null);
      setMutedAuthorIds(new Set());
      setReactionPendingIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = 'auto';
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 112)}px`;
  }, [text]);

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim() || postingRef.current) return;

    postingRef.current = true;
    setComposerError(null);
    const commentText = text.trim();
    let error: string | null;
    try {
      ({ error } = await postComment(commentText));
    } catch {
      error = 'Could not post your comment. Check your connection and try again.';
    } finally {
      postingRef.current = false;
    }
    if (error) {
      setComposerError(error);
      return;
    }

    setText('');
    setReplyTo(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    onCommentCountChange?.(1);
    if (typeof listRef.current?.scrollTo === 'function') {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    toast.success('Your comment is live.');
  };

  const handleReply = (comment: CommentWithAuthor) => {
    if (!currentUserId) {
      toast('Sign in to reply to comments.');
      return;
    }
    setReplyTo(comment);
    setText((current) => current.startsWith(`@${comment.author.display_name} `)
      ? current
      : `@${comment.author.display_name} ${current}`);
    inputRef.current?.focus();
  };

  const handleDelete = async (commentId: string) => {
    if (deletingId) return;

    setDeletingId(commentId);
    setComposerError(null);
    const { error } = await deleteComment(commentId);
    setDeletingId(null);
    setConfirmDeleteId(null);

    if (error) {
      setComposerError(error);
      return;
    }

    onCommentCountChange?.(-1);
    toast('Comment removed');
  };

  const handleHelpful = async (comment: CommentWithAuthor) => {
    if (!currentUserId) {
      toast('Sign in to mark comments helpful.');
      return;
    }
    setReactionPendingIds((current) => new Set(current).add(comment.id));
    const { error } = await toggleHelpful(comment.id);
    setReactionPendingIds((current) => {
      const next = new Set(current);
      next.delete(comment.id);
      return next;
    });
    if (error) toast.error(error);
  };

  const handleMuteAuthor = (comment: CommentWithAuthor) => {
    setMutedAuthorIds((current) => new Set(current).add(comment.user_id));
    setActionMenuId(null);
    toast(`Comments from ${comment.author.display_name} hidden.`);
  };

  const handleReport = async (comment: CommentWithAuthor, reason: string) => {
    if (!currentUserId) {
      toast('Sign in to report a comment.');
      setActionMenuId(null);
      return;
    }
    setReportingId(comment.id);
    let reportError: boolean;
    try {
      const { error } = await supabase.from('reports').insert({
        video_id: videoId,
        reported_user_id: comment.user_id,
        reason: `comment_${reason}`,
        details: `Comment ID: ${comment.id}`,
      });
      reportError = Boolean(error);
    } catch {
      reportError = true;
    } finally {
      setReportingId(null);
      setActionMenuId(null);
    }
    if (reportError) {
      toast.error('Could not send that report. Please try again.');
    } else {
      toast.success('Thanks. Our team will review this comment.');
    }
  };

  const visibleComments = comments.filter((comment) => !mutedAuthorIds.has(comment.user_id));

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center md:items-center md:px-6 md:py-8" role="presentation">
      <button
        type="button"
        aria-label="Close comments"
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-title"
        className="relative flex h-[min(88dvh,760px)] w-full max-w-xl flex-col overflow-hidden rounded-t-[24px] border-t border-white/10 bg-[#101010] shadow-2xl md:h-[min(82vh,760px)] md:rounded-2xl md:border md:border-white/10"
        style={{ animation: 'slideUp 0.25s ease-out' }}
      >
        <div className="mx-auto mb-2 mt-3 h-1 w-10 rounded-full bg-white/20 md:hidden" />

        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 pb-4 pt-1 md:px-6 md:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 ring-1 ring-accent/20">
              <MessageCircle className="h-[19px] w-[19px] text-accent" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="comments-title" className="truncate text-base font-bold text-white">
                  Comments
                </h2>
                {!loading && comments.length > 0 && (
                  <span aria-label={`${comments.length} comments loaded`} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white/60">
                    {comments.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/45">Join the conversation and share your take.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain px-5 py-2 md:px-6 md:py-3"
          style={{ scrollbarWidth: 'none' }}
          aria-busy={loading}
          aria-live="polite"
        >
          {loading && (
            <div className="divide-y divide-white/[0.06]" aria-label="Loading comments">
              <CommentSkeleton />
              <CommentSkeleton />
              <CommentSkeleton />
            </div>
          )}

          {!loading && loadError && (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
                <AlertCircle className="h-6 w-6 text-error" />
              </div>
              <p className="text-base font-semibold text-white">Comments couldn’t load</p>
              <p className="mt-1 max-w-64 text-xs leading-5 text-white/45">{loadError}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-4 flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 active:scale-95"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}

          {!loading && !loadError && comments.length === 0 && (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 ring-1 ring-accent/20">
                <MessageCircle className="h-7 w-7 text-accent" />
              </div>
              <p className="text-lg font-bold tracking-tight text-white">Your take belongs here.</p>
              <p className="mt-2 max-w-72 text-sm leading-6 text-white/45">
                Start the conversation. What stood out to you?
              </p>
            </div>
          )}

          {!loading && !loadError && comments.length > 0 && visibleComments.length === 0 && (
            <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06]">
                <VolumeX className="h-6 w-6 text-white/55" />
              </div>
              <p className="text-base font-semibold text-white">You’ve hidden these comments</p>
              <p className="mt-1 max-w-64 text-sm leading-6 text-white/45">
                Hidden authors stay hidden for this session.
              </p>
              <button
                type="button"
                onClick={() => setMutedAuthorIds(new Set())}
                className="mt-4 rounded-full bg-white/[0.08] px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.12]"
              >
                Show comments again
              </button>
            </div>
          )}

          {!loading && !loadError && visibleComments.length > 0 && (
            <div className="divide-y divide-white/[0.07]">
              {visibleComments.map((comment) => {
                const isOwn = currentUserId === comment.user_id;
                const confirmingDelete = confirmDeleteId === comment.id;
                const deleting = deletingId === comment.id;

                return (
                  <article key={comment.id} className="group flex gap-3.5 py-4 first:pt-3">
                    <CommentAvatar comment={comment} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {comment.author.display_name}
                        </span>
                        {isOwn && (
                          <span className="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                            You
                          </span>
                        )}
                        <time dateTime={comment.created_at} className="ml-auto shrink-0 text-[11px] text-white/35">
                          {timeAgo(comment.created_at)}
                        </time>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-white/80">
                        {comment.text}
                      </p>

                      <div className="mt-2 flex min-h-8 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void handleHelpful(comment)}
                          disabled={isOwn || reactionPendingIds.has(comment.id)}
                          aria-pressed={comment.viewerFoundHelpful}
                          aria-label={isOwn ? 'You cannot mark your own comment helpful' : comment.viewerFoundHelpful ? 'Remove helpful reaction' : 'Mark comment helpful'}
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${comment.viewerFoundHelpful ? 'bg-accent/10 text-accent' : 'text-white/45 hover:bg-white/[0.06] hover:text-white/80'}`}
                        >
                          <Heart className={`h-3.5 w-3.5 ${comment.viewerFoundHelpful ? 'fill-current' : ''}`} />
                          Helpful{comment.helpfulCount > 0 ? ` · ${comment.helpfulCount}` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReply(comment)}
                          className="rounded-full px-2.5 py-1 text-xs font-semibold text-white/45 transition hover:bg-white/[0.06] hover:text-white/80"
                        >
                          Reply
                        </button>
                        {!isOwn && <div className="relative ml-auto">
                          <button
                            type="button"
                            onClick={() => setActionMenuId((current) => current === comment.id ? null : comment.id)}
                            aria-label="Comment options"
                            aria-expanded={actionMenuId === comment.id}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/80"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {actionMenuId === comment.id && (
                            <div className="absolute bottom-full right-0 z-10 mb-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#202020] p-1 shadow-xl">
                              <button
                                type="button"
                                onClick={() => handleMuteAuthor(comment)}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs text-white/75 hover:bg-white/[0.06]"
                              >
                                <VolumeX className="h-3.5 w-3.5" />
                                Hide this person’s comments
                              </button>
                              <div className="my-1 border-t border-white/[0.07]" />
                              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/35">Report comment</p>
                              {[
                                ['harassment', 'Harassment'],
                                ['spam', 'Spam'],
                                ['hate', 'Hate or abuse'],
                                ['other', 'Something else'],
                              ].map(([reason, label]) => (
                                <button
                                  type="button"
                                  key={reason}
                                  disabled={reportingId === comment.id}
                                  onClick={() => void handleReport(comment, reason)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-white/65 hover:bg-white/[0.06] disabled:opacity-50"
                                >
                                  {reportingId === comment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>}
                        {isOwn && (confirmingDelete ? (
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-white/40">Remove this?</span>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={deleting}
                                className="rounded-full px-2 py-1 font-medium text-white/60 hover:bg-white/10 hover:text-white"
                              >
                                Keep
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(comment.id)}
                                disabled={deleting}
                                className="flex items-center gap-1 rounded-full bg-error/10 px-2 py-1 font-semibold text-error hover:bg-error/15 disabled:opacity-50"
                              >
                                {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(comment.id)}
                              aria-label="Delete comment"
                              className="flex h-6 items-center gap-1 rounded-full px-2 text-[10px] text-white/25 transition hover:bg-error/10 hover:text-error"
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </button>
                          ))}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer
          className="border-t border-white/[0.08] bg-[#101010] px-5 pb-3 pt-3 md:px-6 md:pt-4"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {isBanned ? (
            <div className="flex items-center gap-2 rounded-xl bg-error/15 px-3 py-2.5 text-xs text-error">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Account suspended: {banReason || 'Commenting is restricted for your account.'}
              </span>
            </div>
          ) : (
            <>
              {composerError && (
                <div role="alert" aria-live="assertive" className="mb-2 flex items-center gap-2 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {composerError}
                </div>
              )}
              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  {replyTo && (
                    <div className="mb-2 flex items-center justify-between rounded-lg border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs text-white/65">
                      <span>Replying to <strong className="font-semibold text-white">{replyTo.author.display_name}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTo(null);
                          setText((current) => current.replace(`@${replyTo.author.display_name} `, ''));
                        }}
                        aria-label="Cancel reply"
                        className="rounded p-1 text-white/45 hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="rounded-2xl bg-[#1a1a1a] px-3.5 py-2.5 ring-1 ring-white/10 transition focus-within:ring-accent/60">
                    <textarea
                      ref={inputRef}
                      value={text}
                      onChange={(event) => {
                        setText(event.target.value);
                        if (composerError) setComposerError(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                          event.preventDefault();
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      maxLength={500}
                      rows={1}
                      aria-invalid={Boolean(composerError)}
                      placeholder="Share your take…"
                      aria-label="Write a comment"
                      aria-describedby="comment-composer-hint"
                      className="block max-h-28 min-h-6 w-full resize-none bg-transparent text-sm leading-6 text-white outline-none placeholder:text-white/35"
                    />
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <span id="comment-composer-hint" className="truncate text-[10px] text-white/35">
                        Keep it kind. Press Ctrl/⌘ + Enter to post.
                      </span>
                      {text.length >= 400 && (
                        <span className={`text-[10px] ${text.length >= 480 ? 'text-warning' : 'text-white/30'}`}>
                          {text.length}/500
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={posting || !text.trim()}
                  aria-label={posting ? 'Posting comment' : 'Post comment'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/20 transition hover:bg-accent-hover active:scale-90 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
                >
                  {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
