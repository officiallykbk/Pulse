import { useState, useEffect } from 'react';
import {
  Shield,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Trash2,
  UserX,
  UserCheck,
  Search,
  MessageSquare,
  Film,
  Users,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/services/supabase';
import {
  getPendingReviewVideos,
  approveVideo,
  rejectVideo,
  getRecentComments,
  deleteCommentAsAdmin,
  getProfilesForModeration,
  banUser,
  unbanUser,
  type PendingVideo,
  type ModerationComment,
} from '@/services/adminModeration';
import type { Profile } from '@/types';
import { GeneratedAvatar } from '@/components/GeneratedAvatar';
import { toast } from 'sonner';

interface AdminDashboardProps {
  onBack: () => void;
}

type AdminTab = 'videos' | 'comments' | 'users';

export function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [activeTab, setActiveTab] = useState<AdminTab>('videos');

  // Video reviews state
  const [pendingVideos, setPendingVideos] = useState<PendingVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [rejectingVideoId, setRejectingVideoId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingVideoId, setProcessingVideoId] = useState<string | null>(null);

  // Comment moderation state
  const [comments, setComments] = useState<ModerationComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // User moderation state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [banningUserId, setBanningUserId] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  // Check admin privileges on mount
  useEffect(() => {
    let active = true;
    const checkRole = async () => {
      try {
        const res = await supabase?.auth?.getUser?.();
        const user = res?.data?.user;
        if (!active) return;
        if (!user) {
          setIsAdmin(false);
          setLoadingRole(false);
          return;
        }
        setCurrentAdminId(user.id);

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (!active) return;
        const userIsAdmin = profile?.role === 'admin' || profile?.role === 'moderator';
        setIsAdmin(userIsAdmin);
        setLoadingRole(false);

        if (userIsAdmin) {
          void loadVideos();
        }
      } catch {
        if (active) {
          setIsAdmin(false);
          setLoadingRole(false);
        }
      }
    };
    void checkRole();
    return () => {
      active = false;
    };
  }, []);

  const loadVideos = async () => {
    setLoadingVideos(true);
    try {
      const data = await getPendingReviewVideos();
      setPendingVideos(data);
    } catch {
      toast.error('Failed to load pending videos');
    } finally {
      setLoadingVideos(false);
    }
  };

  const loadComments = async () => {
    setLoadingComments(true);
    try {
      const data = await getRecentComments();
      setComments(data);
    } catch {
      toast.error('Failed to load comments');
    } finally {
      setLoadingComments(false);
    }
  };

  const loadProfiles = async (query = userSearchQuery) => {
    setLoadingProfiles(true);
    try {
      const data = await getProfilesForModeration(query);
      setProfiles(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoadingProfiles(false);
    }
  };

  // Switch tabs and load relevant dataset
  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    if (tab === 'videos') loadVideos();
    if (tab === 'comments') loadComments();
    if (tab === 'users') loadProfiles();
  };

  const handleApproveVideo = async (videoId: string) => {
    if (!currentAdminId) return;
    setProcessingVideoId(videoId);
    try {
      await approveVideo(videoId, currentAdminId);
      setPendingVideos((prev) => prev.filter((v) => v.id !== videoId));
      toast.success('Video approved and published to feed');
    } catch {
      toast.error('Could not approve video');
    } finally {
      setProcessingVideoId(null);
    }
  };

  const handleRejectVideo = async (videoId: string) => {
    if (!currentAdminId) return;
    if (!rejectionReason.trim()) {
      toast.error('Please specify a rejection reason');
      return;
    }
    setProcessingVideoId(videoId);
    try {
      await rejectVideo(videoId, rejectionReason, currentAdminId);
      setPendingVideos((prev) => prev.filter((v) => v.id !== videoId));
      setRejectingVideoId(null);
      setRejectionReason('');
      toast('Video rejected');
    } catch {
      toast.error('Could not reject video');
    } finally {
      setProcessingVideoId(null);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    try {
      await deleteCommentAsAdmin(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success('Comment deleted by admin');
    } catch {
      toast.error('Failed to delete comment');
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!banReason.trim()) {
      toast.error('Please enter a reason for the ban');
      return;
    }
    setProcessingUserId(userId);
    try {
      await banUser(userId, banReason);
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, is_banned: true, ban_reason: banReason } : p))
      );
      setBanningUserId(null);
      setBanReason('');
      toast.success('User suspended from Pulse');
    } catch {
      toast.error('Failed to suspend user');
    } finally {
      setProcessingUserId(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    setProcessingUserId(userId);
    try {
      await unbanUser(userId);
      setProfiles((prev) =>
        prev.map((p) => (p.id === userId ? { ...p, is_banned: false, ban_reason: null } : p))
      );
      toast.success('User suspension lifted');
    } catch {
      toast.error('Failed to unban user');
    } finally {
      setProcessingUserId(null);
    }
  };

  if (loadingRole) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-center text-white">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-error/15 text-error">
          <Shield className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="mt-2 max-w-xs text-xs text-white/50">
          Administrator credentials are required to view the Pulse moderation console.
        </p>
        <button
          onClick={onBack}
          className="mt-6 flex items-center gap-2 rounded-full bg-surface-raised px-5 py-2.5 text-xs font-semibold text-white hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-black px-4 pt-6 pb-24 text-white">
      {/* Top Header */}
      <div className="mx-auto max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">
            <Shield className="h-3.5 w-3.5" />
            Admin Moderation
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Admin Console</h1>
        <p className="mt-1 text-xs text-white/50">Review uploads, delete abusive comments, and enforce community standards.</p>

        {/* Tab Navigation */}
        <div className="mt-6 flex rounded-xl bg-surface-raised p-1">
          <button
            onClick={() => handleTabChange('videos')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'videos' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Approvals
            {pendingVideos.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/20 px-1 text-[10px]">
                {pendingVideos.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange('comments')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'comments' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comments
          </button>

          <button
            onClick={() => handleTabChange('users')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all ${
              activeTab === 'users' ? 'bg-accent text-white shadow-sm' : 'text-white/60 hover:text-white'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Users
          </button>
        </div>

        {/* ================= VIDEO APPROVALS TAB ================= */}
        {activeTab === 'videos' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/80">
                Pending Publishing Queue ({pendingVideos.length})
              </h2>
              <button
                onClick={loadVideos}
                disabled={loadingVideos}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {loadingVideos ? (
              <div className="flex h-32 items-center justify-center rounded-2xl bg-surface-raised">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : pendingVideos.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-surface-raised p-8 text-center">
                <CheckCircle className="mx-auto h-8 w-8 text-success/60" />
                <p className="mt-2 text-sm font-semibold text-white">All Caught Up!</p>
                <p className="mt-1 text-xs text-white/40">No pending video uploads requiring review.</p>
              </div>
            ) : (
              pendingVideos.map((video) => (
                <div
                  key={video.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-surface-raised p-4 transition-all"
                >
                  <div className="flex gap-3">
                    <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-black">
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-white/20">
                          <Film className="h-6 w-6" />
                        </div>
                      )}
                      {video.duration_seconds > 0 && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[9px] font-bold">
                          {video.duration_seconds}s
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-white">{video.title}</h3>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            video.visibility === 'public'
                              ? 'bg-accent/20 text-accent'
                              : video.visibility === 'age_restricted'
                              ? 'bg-warning/20 text-warning'
                              : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {video.visibility || 'public'}
                        </span>
                      </div>

                      {video.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-white/60">{video.description}</p>
                      )}

                      <div className="mt-2 flex items-center gap-2 text-[11px] text-white/40">
                        <span>Creator: {video.uploader?.display_name || video.uploader_id?.slice(0, 8) || 'Anonymous'}</span>
                        <span>•</span>
                        <span>{new Date(video.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions rail */}
                  <div className="mt-4 flex gap-2 border-t border-white/5 pt-3">
                    <button
                      onClick={() => handleApproveVideo(video.id)}
                      disabled={processingVideoId === video.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-success/20 py-2 text-xs font-semibold text-success transition hover:bg-success/30 disabled:opacity-50"
                    >
                      {processingVideoId === video.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      Approve & Publish
                    </button>

                    <button
                      onClick={() => {
                        setRejectingVideoId(video.id);
                        setRejectionReason('');
                      }}
                      disabled={processingVideoId === video.id}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-error/15 py-2 text-xs font-semibold text-error transition hover:bg-error/25 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject Video
                    </button>
                  </div>

                  {/* Rejection reason inline prompt */}
                  {rejectingVideoId === video.id && (
                    <div className="mt-3 rounded-xl border border-error/20 bg-black/40 p-3">
                      <label className="block text-xs font-semibold text-error">Rejection Reason</label>
                      <input
                        type="text"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="e.g. Inappropriate content, poor audio quality"
                        className="mt-1 w-full rounded-lg bg-surface-raised px-3 py-2 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-error"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => setRejectingVideoId(null)}
                          className="rounded-lg px-3 py-1.5 text-xs text-white/50 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRejectVideo(video.id)}
                          className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white hover:bg-error/90"
                        >
                          Confirm Rejection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= COMMENT MODERATION TAB ================= */}
        {activeTab === 'comments' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white/80">
                Recent Comments Moderation
              </h2>
              <button
                onClick={loadComments}
                disabled={loadingComments}
                className="text-xs text-accent hover:underline disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            {loadingComments ? (
              <div className="flex h-32 items-center justify-center rounded-2xl bg-surface-raised">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : comments.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-surface-raised p-8 text-center text-white/40">
                No recent comments found.
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-white/5 bg-surface-raised p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">
                        {comment.author?.display_name || 'Pulse user'}
                      </span>
                      <span className="text-[10px] text-white/40">
                        on "{comment.video_title}"
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-white/80">{comment.text}</p>
                    <span className="mt-1 block text-[10px] text-white/30">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    disabled={deletingCommentId === comment.id}
                    title="Delete Comment"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-error/15 hover:text-error disabled:opacity-40"
                  >
                    {deletingCommentId === comment.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-error" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= USER MODERATION TAB ================= */}
        {activeTab === 'users' && (
          <div className="mt-6 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
              <input
                type="text"
                value={userSearchQuery}
                onChange={(e) => {
                  setUserSearchQuery(e.target.value);
                  loadProfiles(e.target.value);
                }}
                placeholder="Search user by display name..."
                className="w-full rounded-xl bg-surface-raised py-2 pl-9 pr-4 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
              />
            </div>

            {loadingProfiles ? (
              <div className="flex h-32 items-center justify-center rounded-2xl bg-surface-raised">
                <Loader2 className="h-5 w-5 animate-spin text-white/40" />
              </div>
            ) : profiles.length === 0 ? (
              <div className="rounded-2xl border border-white/5 bg-surface-raised p-8 text-center text-white/40">
                No users found.
              </div>
            ) : (
              profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded-xl border border-white/5 bg-surface-raised p-3.5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <GeneratedAvatar
                        name={profile.display_name || 'Pulse Member'}
                        className="h-9 w-9 text-xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-white">
                            {profile.display_name || 'Unnamed User'}
                          </p>
                          {profile.is_banned ? (
                            <span className="rounded bg-error/20 px-1.5 py-0.5 text-[9px] font-bold text-error">
                              BANNED
                            </span>
                          ) : (
                            <span className="rounded bg-success/20 px-1.5 py-0.5 text-[9px] font-bold text-success">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[10px] text-white/40">
                          ID: {profile.id.slice(0, 8)}... • Tier: {profile.tier} • Role: {profile.role || 'user'}
                        </p>
                      </div>
                    </div>

                    <div>
                      {profile.is_banned ? (
                        <button
                          onClick={() => handleUnbanUser(profile.id)}
                          disabled={processingUserId === profile.id}
                          className="flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-medium text-success hover:bg-success/15 disabled:opacity-40"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setBanningUserId(profile.id);
                            setBanReason('');
                          }}
                          disabled={processingUserId === profile.id}
                          className="flex items-center gap-1.5 rounded-lg bg-error/15 px-3 py-1.5 text-xs font-medium text-error hover:bg-error/25 disabled:opacity-40"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Ban
                        </button>
                      )}
                    </div>
                  </div>

                  {profile.is_banned && profile.ban_reason && (
                    <div className="mt-2 rounded-lg bg-black/40 px-2.5 py-1.5 text-[11px] text-error/80">
                      Ban reason: {profile.ban_reason}
                    </div>
                  )}

                  {banningUserId === profile.id && (
                    <div className="mt-3 rounded-lg border border-error/20 bg-black/50 p-2.5">
                      <label className="block text-xs font-semibold text-error">Reason for Suspension</label>
                      <input
                        type="text"
                        value={banReason}
                        onChange={(e) => setBanReason(e.target.value)}
                        placeholder="e.g. Spreading spam, abusive comments"
                        className="mt-1 w-full rounded bg-surface-raised px-2.5 py-1.5 text-xs text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-error"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          onClick={() => setBanningUserId(null)}
                          className="px-2.5 py-1 text-xs text-white/50 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleBanUser(profile.id)}
                          className="rounded bg-error px-2.5 py-1 text-xs font-semibold text-white hover:bg-error/90"
                        >
                          Confirm Ban
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
