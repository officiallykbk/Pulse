import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Play, Save, Info, Trash2, Download, LogIn } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { APP_IDENTITY } from '@/config/appIdentity';
import { loadAppSettings, saveAppSettings, DEFAULT_SETTINGS, type AppSettings } from '@/lib/settings';
import type { UserTier } from '@/types';
import { toast } from 'sonner';

interface SettingsScreenProps {
  tier: UserTier;
  onBack: () => void;
  onRequireAuth: () => void;
  onSignOut: () => void;
  onDeleted: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  onOpenAdmin?: () => void;
}

export function SettingsScreen({
  tier,
  onBack,
  onRequireAuth,
  onDeleted,
  onOpenTerms,
  onOpenPrivacy,
  onOpenAdmin,
}: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [savingInsightsConsent, setSavingInsightsConsent] = useState(false);

  useEffect(() => {
    setSettings(loadAppSettings());
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setSignedIn(!!user);
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, viewing_insights')
          .eq('id', user.id)
          .maybeSingle();
        const viewingInsights = Boolean(profile?.viewing_insights);
        setSettings((current) => ({ ...current, viewingInsights }));
        saveAppSettings({ ...loadAppSettings(), viewingInsights });
        if (profile?.role === 'admin' || profile?.role === 'moderator') {
          setIsAdmin(true);
        }
      }
    });
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAppSettings(next);
  };

  const updateViewingInsights = async (enabled: boolean) => {
    if (savingInsightsConsent) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      onRequireAuth();
      return;
    }
    const previous = settings.viewingInsights;
    update({ viewingInsights: enabled });
    setSavingInsightsConsent(true);
    let failed = false;
    let cleanupFailed = false;
    try {
      const { error } = await supabase.from('profiles').update({ viewing_insights: enabled }).eq('id', user.id);
      failed = Boolean(error);
      if (!failed && !enabled) {
        const { error: deleteError } = await supabase.from('video_viewing_insights').delete().eq('user_id', user.id);
        cleanupFailed = Boolean(deleteError);
      }
    } catch {
      failed = true;
    } finally {
      setSavingInsightsConsent(false);
    }
    if (failed) {
      update({ viewingInsights: previous });
      toast.error('Could not save this privacy setting. Try again.');
    } else if (cleanupFailed) {
      toast.error('Tracking is off, but some saved insight data could not be removed. Please try again.');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setExporting(false);
      return;
    }

    const [profile, videos, likes, comments, subscription, savedVideos, watchProgress, viewingInsights, follows] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.from('videos').select('*').eq('uploader_id', user.id),
      supabase.from('likes').select('*').eq('user_id', user.id),
      supabase.from('comments').select('*').eq('user_id', user.id),
      supabase.from('subscriptions').select('*').eq('user_id', user.id),
      supabase.from('saved_videos').select('*').eq('user_id', user.id),
      supabase.from('video_watch_progress').select('*').eq('user_id', user.id),
      supabase.from('video_viewing_insights').select('*').eq('user_id', user.id),
      supabase.from('follows').select('*').or(`follower_id.eq.${user.id},following_id.eq.${user.id}`),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      profile: profile.data ?? null,
      uploaded_videos: videos.data ?? [],
      likes: likes.data ?? [],
      comments: comments.data ?? [],
      subscriptions: subscription.data ?? [],
      saved_videos: savedVideos.data ?? [],
      watch_progress: watchProgress.data ?? [],
      viewing_insights: viewingInsights.data ?? [],
      follows: follows.data ?? [],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${APP_IDENTITY.name.toLowerCase()}-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setDeleting(false);
      setDeleteError('Not signed in');
      return;
    }

    try {
      const results = await Promise.all([
        supabase.from('videos').delete().eq('uploader_id', user.id),
        supabase.from('comments').delete().eq('user_id', user.id),
        supabase.from('likes').delete().eq('user_id', user.id),
        supabase.from('follows').delete().or(`follower_id.eq.${user.id},following_id.eq.${user.id}`),
        supabase.from('subscriptions').delete().eq('user_id', user.id),
        supabase.from('saved_videos').delete().eq('user_id', user.id),
        supabase.from('video_watch_progress').delete().eq('user_id', user.id),
        supabase.from('video_viewing_insights').delete().eq('user_id', user.id),
        supabase.from('profiles').delete().eq('id', user.id),
      ]);

      const failedResult = results.find((r) => r.error);
      if (failedResult && failedResult.error) {
        throw new Error(failedResult.error.message || 'Failed to remove user account data');
      }

      await supabase.auth.signOut();
      setDeleting(false);
      onDeleted();
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete account. Please try again.');
    }
  };

  return (
    <div className="min-h-full bg-black px-4 pb-24" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Settings</h1>
        </div>

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Playback</h2>
        <div className="mb-6 divide-y divide-white/5 rounded-card bg-surface-raised">
          <label className="flex cursor-pointer items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Save className="h-5 w-5 text-white/60" />
              <div>
                <p className="text-sm font-medium text-white">Data Saver Mode</p>
                <p className="text-xs text-white/40">Lower video quality to save data</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.dataSaver}
              onChange={(e) => update({ dataSaver: e.target.checked })}
              className="h-5 w-5 accent-[#E50914]"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Play className="h-5 w-5 text-white/60" />
              <div>
                <p className="text-sm font-medium text-white">Auto-play Videos</p>
                <p className="text-xs text-white/40">Play videos automatically in the feed</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.autoplay}
              onChange={(e) => update({ autoplay: e.target.checked })}
              className="h-5 w-5 accent-[#E50914]"
            />
          </label>
        </div>

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Privacy & personalization</h2>
        <div className="mb-6 divide-y divide-white/5 rounded-card bg-surface-raised">
          <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 shrink-0 text-white/60" />
              <div>
                <p className="text-sm font-medium text-white">Help improve recommendations</p>
                <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-white/40">
                  Share one account-linked viewing summary per video session. Covered by a 90-day cleanup policy,
                  off by default, and not currently used to rank your feed.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.viewingInsights}
              onChange={(event) => void updateViewingInsights(event.target.checked)}
              disabled={savingInsightsConsent}
              className="h-5 w-5 shrink-0 accent-[#E50914] disabled:opacity-50"
            />
          </label>
        </div>

        {isAdmin && onOpenAdmin && (
          <>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Administration</h2>
            <div className="mb-6 rounded-card bg-surface-raised overflow-hidden">
              <button
                data-testid="admin-dashboard-btn"
                onClick={onOpenAdmin}
                className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors active:bg-surface-elevated hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Admin Moderation Console</p>
                    <p className="text-xs text-white/40">Approve uploads, moderate comments, manage bans</p>
                  </div>
                </div>
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                  Admin
                </span>
              </button>
            </div>
          </>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">Data & Privacy</h2>
        <div className="mb-6 divide-y divide-white/5 rounded-card bg-surface-raised">
          <button
            onClick={signedIn ? handleExport : onRequireAuth}
            disabled={exporting}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-surface-elevated"
          >
            <Download className="h-5 w-5 text-white/60" />
            <div>
              <p className="text-sm font-medium text-white">Export My Data</p>
              <p className="text-xs text-white/40">
                {signedIn ? (exporting ? 'Preparing download...' : 'Download a copy of your data') : 'Sign in to export your data'}
              </p>
            </div>
          </button>

          <button
            onClick={signedIn ? () => setConfirmDelete(true) : onRequireAuth}
            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-surface-elevated"
          >
            <Trash2 className="h-5 w-5 text-error" />
            <div>
              <p className="text-sm font-medium text-error">Delete Account</p>
              <p className="text-xs text-white/40">
                {signedIn ? 'Permanently remove your content and account' : 'Sign in first'}
              </p>
            </div>
          </button>
        </div>

        {isAdmin && onOpenAdmin && (
          <div className="mb-6 rounded-card bg-surface-raised p-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">Administration</h2>
            <button
              onClick={onOpenAdmin}
              className="flex w-full items-center justify-between py-2 text-sm font-medium text-white transition-colors active:text-accent"
            >
              <span>Open Admin Dashboard</span>
              <Shield className="h-4 w-4 text-accent" />
            </button>
          </div>
        )}

        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">About</h2>
        <div className="mb-6 rounded-card bg-surface-raised px-4 py-4">
          <div className="mb-3 flex items-center gap-3">
            <Info className="h-5 w-5 text-white/60" />
            <div>
              <p className="text-sm font-medium text-white">{APP_IDENTITY.name}</p>
              <p className="text-xs text-white/40">{APP_IDENTITY.tagline}</p>
            </div>
          </div>
          <div className="space-y-1 border-t border-white/5 pt-3">
            <a
              href="/terms"
              onClick={(e) => {
                if (onOpenTerms) {
                  e.preventDefault();
                  onOpenTerms();
                }
              }}
              className="block py-1.5 text-sm text-white/70 transition-colors active:text-white"
            >
              Terms of Service
            </a>
            <a
              href="/privacy"
              onClick={(e) => {
                if (onOpenPrivacy) {
                  e.preventDefault();
                  onOpenPrivacy();
                }
              }}
              className="block py-1.5 text-sm text-white/70 transition-colors active:text-white"
            >
              Privacy Policy
            </a>
            <a href={`mailto:${APP_IDENTITY.supportEmail}`} className="block py-1.5 text-sm text-white/70 transition-colors active:text-white">
              Contact Support
            </a>
          </div>
        </div>

        {!signedIn && tier === 'anonymous' && (
          <button
            onClick={onRequireAuth}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors active:bg-accent-hover"
          >
            <LogIn className="h-5 w-5" />
            Sign In to Manage Settings
          </button>
        )}

        {confirmDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4">
            <div className="w-full max-w-sm rounded-card bg-surface-raised p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error/15">
                  <Shield className="h-5 w-5 text-error" />
                </div>
                <h3 className="text-lg font-bold text-white">Delete account?</h3>
              </div>
              <p className="mb-5 text-sm text-white/60">
                This removes your videos, likes, comments and profile activity. This cannot be undone.
              </p>
              {deleteError && (
                <p className="mb-3 rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{deleteError}</p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-full border border-white/15 py-3 font-medium text-white/70 transition-colors active:border-white/30"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 rounded-full bg-error py-3 font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
