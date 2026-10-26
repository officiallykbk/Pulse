import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoFeed } from '@/components/VideoFeed';
import { BottomNav, type View } from '@/components/BottomNav';
import { ProfileScreen } from '@/components/ProfileScreen';
import { UploadScreen } from '@/components/UploadScreen';
import { SearchScreen } from '@/components/SearchScreen';
import { SettingsScreen } from '@/components/SettingsScreen';
import { SupportScreen } from '@/components/SupportScreen';
import { EditProfileScreen } from '@/components/EditProfileScreen';
import { Upload as UploadIcon, LogIn } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { ProUpgradeModal } from '@/components/ProUpgradeModal';
import { SideRail } from '@/components/SideRail';
import { useAuth } from '@/hooks/useAuth';
import { useVideos } from '@/hooks/useVideos';
import { useUserVideos } from '@/hooks/useUserVideos';
import { createViewingBudget, VIEWING_LIMIT_MINUTES, type ViewingBudget } from '@/lib/viewingBudget';
import type { Video } from '@/types';

function App() {
  const { user, tier, loading, signIn, signUp, signOut } = useAuth();
  const { videos, initialLoading, loadingMore, hasMore, loadVideos } = useVideos();
  const { uploaded, liked: likedVideos, loading: userVideosLoading } = useUserVideos(user?.id ?? null);
  const [view, setView] = useState<View>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [budget, setBudget] = useState<ViewingBudget>(() => ({ remainingMs: 0, exhausted: false, nearLimit: false }));

  const budgetRef = useRef(createViewingBudget(tier));
  useEffect(() => {
    budgetRef.current = createViewingBudget(tier);
    setBudget(budgetRef.current.snapshot());
  }, [tier]);

  useEffect(() => {
    if (tier !== 'anonymous') return;
    const tracker = budgetRef.current;
    tracker.start();
    setBudget(tracker.snapshot());
    const refresh = setInterval(() => setBudget(tracker.snapshot()), 5000);
    return () => {
      tracker.stop();
      clearInterval(refresh);
    };
  }, [tier]);

  useEffect(() => {
    loadVideos(true);
  }, [loadVideos]);

  const handleLoadMore = useCallback(() => {
    loadVideos(false);
  }, [loadVideos]);

  const handleUpgradeClick = useCallback(() => {
    if (tier === 'anonymous') {
      setAuthOpen(true);
    } else {
      setUpgradeOpen(true);
    }
  }, [tier]);

  const handleUploadSuccess = useCallback(() => {
    setView('home');
    loadVideos(true);
  }, [loadVideos]);

  const handlePlayVideo = useCallback((video: Video) => {
    loadVideos(true);
    setView('home');
  }, [loadVideos]);

  if (loading || initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="device-shell fixed inset-0 bg-black text-white">
      <SideRail activeView={view === 'search' ? 'home' : view} onChange={(v) => setView(v)} />

      <div className="device-column relative flex-1 bg-black">
      {view === 'home' && !budget.exhausted && (
        <VideoFeed
          videos={videos}
          tier={tier}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          onUpgrade={handleUpgradeClick}
          onRequireAuth={() => setAuthOpen(true)}
          onSearch={() => setView('search')}
        />
      )}

      {view === 'home' && budget.exhausted && (
        <div className="flex h-full flex-col items-center justify-center bg-black px-6 pb-24">
          <h2 className="mb-2 text-xl font-bold text-white">You've used your free viewing time</h2>
          <p className="mb-2 max-w-sm text-center text-sm leading-relaxed text-white/60">
            Guests get {VIEWING_LIMIT_MINUTES} minutes of viewing per day. Register to keep watching — it's free.
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="mt-2 flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white transition-colors active:bg-accent-hover"
          >
            <LogIn className="h-5 w-5" />
            Register to Continue
          </button>
        </div>
      )}

      {view === 'home' && !budget.exhausted && budget.nearLimit && (
        <div
          className="absolute left-1/2 top-16 z-50 -translate-x-1/2"
          style={{ animation: 'fadeInDown 0.3s ease-out' }}
        >
          <div className="rounded-full bg-black/85 px-4 py-2 backdrop-blur-sm">
            <span className="text-sm text-white">
              {Math.ceil(budget.remainingMs / 60000)} minutes of guest viewing left today
            </span>
          </div>
        </div>
      )}

      {view === 'search' && (
        <SearchScreen
          onBack={() => setView('home')}
          onPlayVideo={handlePlayVideo}
        />
      )}

      {view === 'upload' && user && <UploadScreen onUploaded={handleUploadSuccess} />}

      {view === 'upload' && !user && (
        <div className="flex min-h-full flex-col items-center justify-center bg-black px-6 pb-24">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-raised">
            <UploadIcon className="h-8 w-8 text-white/40" />
          </div>
          <h2 className="mb-2 text-lg font-semibold text-white">Sign in to upload</h2>
          <p className="mb-6 text-center text-sm text-white/50">
            Create an account or sign in to share your videos with Ghana
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-white transition-colors active:bg-accent-hover"
          >
            <LogIn className="h-5 w-5" />
            Sign In
          </button>
        </div>
      )}

      {view === 'profile' && (
        <ProfileScreen
          email={user?.email ?? null}
          tier={tier}
          uploadedVideos={uploaded}
          likedVideos={likedVideos}
          loadingVideos={userVideosLoading}
          onUpgrade={handleUpgradeClick}
          onSignIn={() => setAuthOpen(true)}
          onSignOut={signOut}
          onOpenSettings={() => setView('settings')}
          onOpenEditProfile={() => setView('editProfile')}
          refreshKey={profileRefreshKey}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen
          tier={tier}
          onBack={() => setView('profile')}
          onRequireAuth={() => setAuthOpen(true)}
          onSignOut={signOut}
          onDeleted={() => {
            setProfileRefreshKey((k) => k + 1);
            setView('home');
          }}
        />
      )}

      {view === 'support' && <SupportScreen onBack={() => setView('profile')} />}

      {view === 'editProfile' && (
        <EditProfileScreen
          onBack={() => setView('profile')}
          onSaved={() => {
            setProfileRefreshKey((k) => k + 1);
            setView('profile');
          }}
        />
      )}

      <BottomNav activeView={view === 'search' ? 'home' : view} onChange={(v) => {
        if (v === 'profile') {
          setView('profile');
        } else {
          setView(v);
        }
      }} />
      </div>

      <AuthScreen
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignIn={signIn}
        onSignUp={signUp}
      />

      <ProUpgradeModal
        open={upgradeOpen}
        email={user?.email ?? ''}
        tier={tier}
        onClose={() => setUpgradeOpen(false)}
        onSuccess={() => {
          setUpgradeOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}

export default App;
