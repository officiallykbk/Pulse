import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPendingReviewVideos,
  approveVideo,
  rejectVideo,
  getRecentComments,
  deleteCommentAsAdmin,
  banUser,
  unbanUser,
} from '@/services/adminModeration';

const { updateMock, deleteMock, eqUpdateMock, eqDeleteMock } = vi.hoisted(() => {
  const eqUpdate = vi.fn().mockResolvedValue({ error: null });
  const eqDelete = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate });
  const del = vi.fn().mockReturnValue({ eq: eqDelete });
  return {
    updateMock: update,
    deleteMock: del,
    eqUpdateMock: eqUpdate,
    eqDeleteMock: eqDelete,
  };
});

vi.mock('@/services/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'videos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'video-pending-1',
                      title: 'Dance Challenge Accra',
                      uploader_id: 'user-creator-1',
                      status: 'pending_review',
                      visibility: 'public',
                      is_active: false,
                    },
                  ],
                  error: null,
                }),
              }),
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'video-1', title: 'Viral Reel' }],
                error: null,
              }),
            }),
            update: (...args: unknown[]) => updateMock(...args),
          };
        }

        if (table === 'comments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'comment-1',
                      video_id: 'video-1',
                      user_id: 'user-troll',
                      text: 'Spam comment text',
                      created_at: new Date().toISOString(),
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            delete: (...args: unknown[]) => deleteMock(...args),
          };
        }

        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'user-creator-1', display_name: 'Kofi Beats', avatar_url: null }],
                error: null,
              }),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'user-1',
                      display_name: 'Ama Serwaa',
                      tier: 'free',
                      role: 'user',
                      is_banned: false,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            update: (...args: unknown[]) => updateMock(...args),
          };
        }

        return {};
      }),
    },
  };
});

describe('adminModeration Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eqUpdateMock.mockResolvedValue({ error: null });
    eqDeleteMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqUpdateMock });
    deleteMock.mockReturnValue({ eq: eqDeleteMock });
  });

  it('fetches pending review videos and enriches with uploader metadata', async () => {
    const pending = await getPendingReviewVideos();
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('Dance Challenge Accra');
    expect(pending[0].status).toBe('pending_review');
    expect(pending[0].uploader?.display_name).toBe('Kofi Beats');
  });

  it('approves a video by marking status published and is_active true', async () => {
    await approveVideo('video-pending-1', 'admin-id-123');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        is_active: true,
        reviewed_by: 'admin-id-123',
      })
    );
  });

  it('rejects a video with rejection reason and marks is_active false', async () => {
    await rejectVideo('video-pending-1', 'Audio copyrighted or low quality', 'admin-id-123');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        is_active: false,
        rejection_reason: 'Audio copyrighted or low quality',
        reviewed_by: 'admin-id-123',
      })
    );
  });

  it('requires a reason to reject a video', async () => {
    await expect(rejectVideo('video-pending-1', '', 'admin-id-123')).rejects.toThrow(
      'Rejection reason is required'
    );
  });

  it('fetches recent comments for moderation', async () => {
    const comments = await getRecentComments();
    expect(comments).toHaveLength(1);
    expect(comments[0].text).toBe('Spam comment text');
  });

  it('deletes comment as admin', async () => {
    await deleteCommentAsAdmin('comment-1');
    expect(deleteMock).toHaveBeenCalled();
  });

  it('bans a user with reason and timestamp', async () => {
    await banUser('user-troll', 'Repeated spam in comments');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_banned: true,
        ban_reason: 'Repeated spam in comments',
      })
    );
  });

  it('requires a reason to ban a user', async () => {
    await expect(banUser('user-troll', '')).rejects.toThrow('Ban reason is required');
  });

  it('unbans a user and clears ban metadata', async () => {
    await unbanUser('user-troll');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_banned: false,
        ban_reason: null,
        banned_at: null,
      })
    );
  });
});
