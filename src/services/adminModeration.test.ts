import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPendingReviewVideos,
  getVideosForModeration,
  approveVideo,
  rejectVideo,
  updateVideoCategoryAndTags,
  deleteVideoAsAdmin,
  bulkApproveVideos,
  bulkAssignCategory,
  bulkDeleteVideos,
  getRecentComments,
  deleteCommentAsAdmin,
  banUser,
  unbanUser,
} from '@/services/adminModeration';

const { updateMock, deleteMock, eqUpdateMock, inUpdateMock, eqDeleteMock, inDeleteMock } = vi.hoisted(() => {
  const eqUpdate = vi.fn().mockResolvedValue({ error: null });
  const inUpdate = vi.fn().mockResolvedValue({ error: null });
  const eqDelete = vi.fn().mockResolvedValue({ error: null });
  const inDelete = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: eqUpdate, in: inUpdate });
  const del = vi.fn().mockReturnValue({ eq: eqDelete, in: inDelete });
  return {
    updateMock: update,
    deleteMock: del,
    eqUpdateMock: eqUpdate,
    inUpdateMock: inUpdate,
    eqDeleteMock: eqDelete,
    inDeleteMock: inDelete,
  };
});

vi.mock('@/services/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'videos') {
          const selectChain: Record<string, unknown> = {};
          selectChain.order = vi.fn().mockReturnValue(selectChain);
          selectChain.limit = vi.fn().mockResolvedValue({
            data: [
              {
                id: 'video-pending-1',
                title: 'Dance Challenge Accra',
                uploader_id: 'user-creator-1',
                status: 'pending_review',
                visibility: 'public',
                category: 'Dance',
                tags: ['dance', 'accra'],
                is_active: false,
                created_at: '2026-10-27T10:00:00Z',
              },
            ],
            error: null,
          });
          selectChain.eq = vi.fn().mockReturnValue(selectChain);
          selectChain.ilike = vi.fn().mockReturnValue(selectChain);
          selectChain.in = vi.fn().mockResolvedValue({
            data: [{ id: 'video-1', title: 'Viral Reel' }],
            error: null,
          });

          return {
            select: vi.fn().mockReturnValue(selectChain),
            update: (...args: unknown[]) => updateMock(...args),
            delete: (...args: unknown[]) => deleteMock(...args),
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
    inUpdateMock.mockResolvedValue({ error: null });
    eqDeleteMock.mockResolvedValue({ error: null });
    inDeleteMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqUpdateMock, in: inUpdateMock });
    deleteMock.mockReturnValue({ eq: eqDeleteMock, in: inDeleteMock });
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

  it('fetches videos for moderation with category and status filter', async () => {
    const videos = await getVideosForModeration({
      status: 'published',
      category: 'Dance',
      searchQuery: 'Accra',
    });
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe('Dance Challenge Accra');
    expect(videos[0].category).toBe('Dance');
    expect(videos[0].tags).toContain('dance');
  });

  it('updates video category and tags with sanitization', async () => {
    await updateVideoCategoryAndTags('video-pending-1', 'Music', ['#Beats', ' Ghana ', 'beats']);
    expect(updateMock).toHaveBeenCalledWith({
      category: 'Music',
      tags: ['beats', 'ghana'],
    });
    expect(eqUpdateMock).toHaveBeenCalledWith('id', 'video-pending-1');
  });

  it('soft-deletes video as admin', async () => {
    await deleteVideoAsAdmin('video-pending-1', true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        status: 'rejected',
      })
    );
    expect(eqUpdateMock).toHaveBeenCalledWith('id', 'video-pending-1');
  });

  it('hard-deletes video as admin', async () => {
    await deleteVideoAsAdmin('video-pending-1', false);
    expect(deleteMock).toHaveBeenCalled();
    expect(eqDeleteMock).toHaveBeenCalledWith('id', 'video-pending-1');
  });

  it('bulk approves videos', async () => {
    await bulkApproveVideos(['vid-1', 'vid-2'], 'admin-123');
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        is_active: true,
        reviewed_by: 'admin-123',
      })
    );
    expect(inUpdateMock).toHaveBeenCalledWith('id', ['vid-1', 'vid-2']);
  });

  it('bulk assigns category to videos', async () => {
    await bulkAssignCategory(['vid-1', 'vid-2'], 'Comedy');
    expect(updateMock).toHaveBeenCalledWith({ category: 'Comedy' });
    expect(inUpdateMock).toHaveBeenCalledWith('id', ['vid-1', 'vid-2']);
  });

  it('bulk soft-deletes videos', async () => {
    await bulkDeleteVideos(['vid-1', 'vid-2'], true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        is_active: false,
        status: 'rejected',
      })
    );
    expect(inUpdateMock).toHaveBeenCalledWith('id', ['vid-1', 'vid-2']);
  });
});
