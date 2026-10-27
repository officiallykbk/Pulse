import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentsSheet } from '@/components/CommentsSheet';
import type { CommentWithAuthor } from '@/hooks/useComments';

const state = vi.hoisted(() => ({
  comments: [] as CommentWithAuthor[],
  loading: false,
  loadError: null as string | null,
  posting: false,
  isBanned: false,
  reports: [] as Array<Record<string, unknown>>,
  postComment: vi.fn(async () => ({ error: null as string | null })),
  deleteComment: vi.fn(async () => ({ error: null as string | null })),
  toggleHelpful: vi.fn(async () => ({ error: null as string | null })),
  refetch: vi.fn(async () => undefined),
}));

vi.mock('@/hooks/useComments', () => ({
  useComments: vi.fn(() => ({
    comments: state.comments,
    loading: state.loading,
    posting: state.posting,
    error: state.loadError,
    postComment: state.postComment,
    deleteComment: state.deleteComment,
    toggleHelpful: state.toggleHelpful,
    refetch: state.refetch,
  })),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { is_banned: state.isBanned, ban_reason: state.isBanned ? 'Repeated abuse' : null } }),
        }),
      }),
      insert: vi.fn(async (payload: Record<string, unknown>) => {
        state.reports.push(payload);
        return { error: null };
      }),
    })),
  },
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn() }),
}));

const ownComment: CommentWithAuthor = {
  id: 'comment-1',
  video_id: 'video-1',
  user_id: 'user-1',
  text: 'This made my day!',
  created_at: new Date().toISOString(),
  helpfulCount: 0,
  viewerFoundHelpful: false,
  author: { display_name: 'Ama Bright', avatar_url: null },
};

describe('CommentsSheet', () => {
  beforeEach(() => {
    state.comments = [];
    state.loading = false;
    state.loadError = null;
    state.posting = false;
    state.isBanned = false;
    state.reports = [];
    state.postComment.mockReset().mockResolvedValue({ error: null });
    state.deleteComment.mockReset().mockResolvedValue({ error: null });
    state.toggleHelpful.mockReset().mockResolvedValue({ error: null });
    state.refetch.mockReset().mockResolvedValue(undefined);
  });

  it('shows the conversation-first empty state', async () => {
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);
    await act(async () => undefined);
    expect(screen.getByText('Your take belongs here.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Share your take…')).toBeInTheDocument();
  });

  it('posts a comment and updates the visible count', async () => {
    const user = userEvent.setup();
    const onCommentCountChange = vi.fn();
    render(
      <CommentsSheet
        videoId="video-1"
        open
        onClose={vi.fn()}
        onCommentCountChange={onCommentCountChange}
      />,
    );

    await user.type(screen.getByLabelText('Write a comment'), 'Love this energy');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(state.postComment).toHaveBeenCalledWith('Love this energy'));
    expect(onCommentCountChange).toHaveBeenCalledWith(1);
  });

  it('asks before deleting an owned comment', async () => {
    state.comments = [ownComment];
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Ama Bright')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(screen.getByText('Remove this?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(state.deleteComment).toHaveBeenCalledWith('comment-1');
  });

  it('starts an inline reply with an author mention and allows canceling it', async () => {
    state.comments = [ownComment];
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to')).toBeInTheDocument();
    expect(screen.getAllByText('Ama Bright').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Write a comment')).toHaveValue('@Ama Bright ');

    await user.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Write a comment')).toHaveValue('');
  });

  it('lets signed-in viewers mark a comment helpful', async () => {
    state.comments = [{ ...ownComment, user_id: 'another-user', author: { display_name: 'Kojo', avatar_url: null } }];
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Mark comment helpful' }));
    expect(state.toggleHelpful).toHaveBeenCalledWith('comment-1');
  });

  it('submits a report with comment and reported-user references', async () => {
    state.comments = [{ ...ownComment, user_id: 'another-user', author: { display_name: 'Kojo', avatar_url: null } }];
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Comment options' }));
    await user.click(screen.getByRole('button', { name: 'Harassment' }));
    await waitFor(() => expect(state.reports).toContainEqual({
      video_id: 'video-1',
      reported_user_id: 'another-user',
      reason: 'comment_harassment',
      details: 'Comment ID: comment-1',
    }));
  });

  it('hides an author locally and can restore the hidden comments', async () => {
    state.comments = [{ ...ownComment, user_id: 'another-user', author: { display_name: 'Kojo', avatar_url: null } }];
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await user.click(await screen.findByRole('button', { name: 'Comment options' }));
    await user.click(screen.getByRole('button', { name: 'Hide this person’s comments' }));
    expect(screen.getByText('You’ve hidden these comments')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show comments again' }));
    expect(screen.getByText('Kojo')).toBeInTheDocument();
  });

  it('disables the composer for a suspended account', async () => {
    state.isBanned = true;
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    expect(await screen.findByText(/Account suspended: Repeated abuse/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Write a comment')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    render(<CommentsSheet videoId="video-1" open onClose={onClose} />);
    await act(async () => undefined);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks background scrolling and restores the previously focused element on close', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await waitFor(() => expect(document.activeElement).toBe(screen.getAllByRole('button', { name: 'Close comments' })[1]));
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('shows a clear success toast after posting', async () => {
    const user = userEvent.setup();
    const { toast } = await import('sonner');
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('Write a comment'), 'Love this energy');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Your comment is live.'));
  });

  it('offers a retry when loading fails', async () => {
    state.loadError = 'Comments took a little detour.';
    const user = userEvent.setup();
    render(<CommentsSheet videoId="video-1" open onClose={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
