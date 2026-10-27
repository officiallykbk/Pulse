import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminDashboard } from '@/components/AdminDashboard';
import * as moderationService from '@/services/adminModeration';

const { mockGetUser, mockMaybeSingle } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
    },
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => mockMaybeSingle(),
      };
      return chain;
    },
  },
}));

vi.mock('@/services/adminModeration', () => ({
  getPendingReviewVideos: vi.fn().mockResolvedValue([
    {
      id: 'pending-vid-1',
      title: 'Hiplife Beats Freestyle',
      description: 'Accra studio session',
      status: 'pending_review',
      visibility: 'public',
      duration_seconds: 45,
      uploader_id: 'user-creator',
      uploader: { display_name: 'Kwame', avatar_url: null },
      created_at: '2026-10-27T10:00:00Z',
    },
  ]),
  approveVideo: vi.fn().mockResolvedValue(undefined),
  rejectVideo: vi.fn().mockResolvedValue(undefined),
  getRecentComments: vi.fn().mockResolvedValue([
    {
      id: 'com-1',
      video_id: 'vid-1',
      video_title: 'Hiplife Beats',
      user_id: 'user-2',
      text: 'Spam link to telegram',
      author: { display_name: 'Bot123', avatar_url: null },
      created_at: '2026-10-27T11:00:00Z',
    },
  ]),
  deleteCommentAsAdmin: vi.fn().mockResolvedValue(undefined),
  getProfilesForModeration: vi.fn().mockResolvedValue([
    {
      id: 'user-spammer',
      display_name: 'Abusive User',
      tier: 'free',
      role: 'user',
      is_banned: false,
    },
  ]),
  banUser: vi.fn().mockResolvedValue(undefined),
  unbanUser: vi.fn().mockResolvedValue(undefined),
}));

describe('AdminDashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'admin@pulse.video' } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'admin-1', role: 'admin' },
      error: null,
    });
    (moderationService.getPendingReviewVideos as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'pending-vid-1',
        title: 'Hiplife Beats Freestyle',
        description: 'Accra studio session',
        status: 'pending_review',
        visibility: 'public',
        duration_seconds: 45,
        uploader_id: 'user-creator',
        uploader: { display_name: 'Kwame', avatar_url: null },
        created_at: '2026-10-27T10:00:00Z',
      },
    ]);
    (moderationService.getRecentComments as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'com-1',
        video_id: 'vid-1',
        video_title: 'Hiplife Beats',
        user_id: 'user-2',
        text: 'Spam link to telegram',
        author: { display_name: 'Bot123', avatar_url: null },
        created_at: '2026-10-27T11:00:00Z',
      },
    ]);
    (moderationService.getProfilesForModeration as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'user-spammer',
        display_name: 'Abusive User',
        tier: 'free',
        role: 'user',
        is_banned: false,
      },
    ]);
  });

  it('renders pending videos queue and allows admin to approve', async () => {
    const onBack = vi.fn();
    render(<AdminDashboard onBack={onBack} />);

    expect(await screen.findByText('Hiplife Beats Freestyle')).toBeInTheDocument();
    expect(screen.getByText('Creator: Kwame')).toBeInTheDocument();

    const approveBtn = screen.getByRole('button', { name: /Approve & Publish/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(moderationService.approveVideo).toHaveBeenCalledWith('pending-vid-1', 'admin-1');
    });
  });

  it('allows admin to reject a video with rejection reason', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    expect(await screen.findByText('Hiplife Beats Freestyle')).toBeInTheDocument();

    const rejectBtn = screen.getByRole('button', { name: /Reject Video/i });
    fireEvent.click(rejectBtn);

    const reasonInput = screen.getByPlaceholderText(/Inappropriate content/i);
    fireEvent.change(reasonInput, { target: { value: 'Contains unauthorized promotional watermark' } });

    const confirmRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(moderationService.rejectVideo).toHaveBeenCalledWith(
        'pending-vid-1',
        'Contains unauthorized promotional watermark',
        'admin-1'
      );
    });
  });

  it('allows switching to comments tab and deleting comments', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    await screen.findByText('Hiplife Beats Freestyle');

    const commentsTab = screen.getByRole('button', { name: /Comments/i });
    fireEvent.click(commentsTab);

    expect(await screen.findByText('Spam link to telegram')).toBeInTheDocument();

    const deleteBtn = screen.getByTitle('Delete Comment');
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(moderationService.deleteCommentAsAdmin).toHaveBeenCalledWith('com-1');
    });
  });

  it('allows switching to users tab and banning a user', async () => {
    render(<AdminDashboard onBack={vi.fn()} />);

    await screen.findByText('Hiplife Beats Freestyle');

    const usersTab = screen.getByRole('button', { name: /Users/i });
    fireEvent.click(usersTab);

    expect(await screen.findByText('Abusive User')).toBeInTheDocument();

    const banBtn = screen.getByRole('button', { name: /Ban/i });
    fireEvent.click(banBtn);

    const reasonInput = screen.getByPlaceholderText(/Spreading spam/i);
    fireEvent.change(reasonInput, { target: { value: 'Violating community guidelines' } });

    const confirmBanBtn = screen.getByRole('button', { name: /Confirm Ban/i });
    fireEvent.click(confirmBanBtn);

    await waitFor(() => {
      expect(moderationService.banUser).toHaveBeenCalledWith('user-spammer', 'Violating community guidelines');
    });
  });
});
