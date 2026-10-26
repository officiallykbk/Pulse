import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Play, Save, Info, Trash2, Download, LogIn } from 'lucide-react';
import { supabase } from '@/services/supabase';
import { APP_IDENTITY } from '@/config/appIdentity';
import type { UserTier } from '@/types';

interface SettingsScreenProps {
  tier: UserTier;
  onBack: () => void;
  onRequireAuth: () => void;
  onSignOut: () => void;
  onDeleted: () => void;
}

const SETTINGS_KEY = APP_IDENTITY.storageKeys.settings;

interface AppSettings {
  dataSaver: boolean;
  autoplay: boolean;
}

const DEFAULT_SETTINGS: AppSettings = { dataSaver: false, autoplay: true };

export function loadAppSettings(): AppSettings {
  try {
    let raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw && APP_IDENTITY.storageKeys.legacySettings) {
      for (const legacyKey of APP_IDENTITY.storageKeys.legacySettings) {
        raw = localStorage.getItem(legacyKey);
        if (raw) break;
      }
    }
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function SettingsScreen({ tier, onBack, onRequireAuth, onDeleted }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSettings(loadAppSettings());
    supabase.auth.getUser().then(({ data: { user } }) => setSignedIn(!!user));
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAppSettings(next);
  };

  const handleExport = async () => {
    setExporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setExporting(false);
      return;
    }

    const [videos, likes, comments, subscription] = await Promise.all([
      supabase.from('videos').select('*').eq('uploader_id', user.id),
      supabase.from('likes').select('*').eq('user_id', user.id),
      supabase.from('comments').select('*').eq('user_id', user.id),
      supabase.from('subscriptions').select('*').eq('user_id', user.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      account: { id: user.id, email: user.email },
      uploaded_videos: videos.data ?? [],
      likes: likes.data ?? [],
      comments: comments.data ?? [],
      subscriptions: subscription.data ?? [],
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

    // Remove owned content first (account row itself is deleted by support/system
    // since auth.users deletion requires elevated rights).
    await supabase.from('videos').delete().eq('uploader_id', user.id);
    await supabase.from('comments').delete().eq('user_id', user.id);
    await supabase.from('likes').delete().eq('user_id', user.id);
    await supabase.from('follows').delete().eq('follower_id', user.id);
    await supabase.from('subscriptions').delete().eq('user_id', user.id);

    await supabase.auth.signOut();
    setDeleting(false);
    onDeleted();
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
            <a href="/terms" className="block py-1.5 text-sm text-white/70 transition-colors active:text-white">
              Terms of Service
            </a>
            <a href="/privacy" className="block py-1.5 text-sm text-white/70 transition-colors active:text-white">
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
