import { useState, useEffect, useCallback, useRef } from 'react';
import { VideoFeed } from '@/components/VideoFeed';
import { BottomNav, type View } from '@/components/BottomNav';
import { ProfileScreen } from '@/components/ProfileScreen';
import { UploadScreen } from '@/components/UploadScreen';
import { SearchScreen } from '@/components/SearchScreen';
import { SettingsScreen } from '@/components/SettingsScreen';
import { SupportScreen } from '@/components/SupportScreen';
import { EditProfileScreen } from '@/components/EditProfileScreen';
import { AdminDashboard } from '@/components/AdminDashboard';
import { TermsScreen } from '@/components/TermsScreen';
import { PrivacyScreen } from '@/components/PrivacyScreen';
import { Upload as UploadIcon, LogIn } from 'lucide-react';
import { AuthScreen } from '@/components/AuthScreen';
import { ProUpgradeModal } from '@/components/ProUpgradeModal';
import { SideRail } from '@/components/SideRail';
import { useAuth } from '@/hooks/useAuth';
import { useVideos } from '@/hooks/useVideos';
import { useUserVideos } from '@/hooks/useUserVideos';
import { createViewingBudget, VIEWING_LIMIT_MINUTES, type ViewingBudget } from '@/lib/viewingBudget';
import type { Video } from '@/types';
import { APP_IDENTITY } from '@/config/appIdentity';
import { toast } from 'sonner';

function App() {
  const { user, tier, loading, signIn, signUp, signOut } = useAuth();
  const { videos, initialLoading, loadingMore, hasMore, loadVideos, loadVideoById, injectVideo } = useVideos();
  const { uploaded, liked: likedVideos, loading: userVideosLoading } = useUserVideos(user?.id ?? null);
  const [view, setView] = useState<View>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [budget, setBudget] = useState<ViewingBudget>(() => ({ remainingMs: 0, exhausted: false, nearLimit: false }));
  const [adLocked, setAdLocked] = useState(false);
  const [feedReady, setFeedReady] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('v') ?? window.location.pathname.match(/^\/watch\/([0-9a-f-]+)\/?$/i)?.[1] ?? null
      : null
  );

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
    void loadVideos(true).finally(() => setFeedReady(true));
  }, [loadVideos]);

  useEffect(() => {
    if (feedReady && selectedVideoId) void loadVideoById(selectedVideoId);
  }, [feedReady, selectedVideoId, loadVideoById]);

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
    injectVideo(video);
    setSelectedVideoId(video.id);
    setView('home');
  }, [injectVideo]);

  if (loading || initialLoading) {
    return (
      <div role="status" aria-label="Loading Pulse" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-black">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent shadow-[0_0_30px_rgba(0,230,118,0.18)] animate-pulse-mark">
          <span className="text-2xl font-black text-white">{APP_IDENTITY.logo.symbol}</span>
        </div>
        <span className="text-[11px] font-semibold tracking-[0.2em] text-white/45">{APP_IDENTITY.logo.text.toUpperCase()}</span>
      </div>
    );
  }

  return (
    <div className="device-shell fixed inset-0 bg-black text-white">
      <SideRail
        activeView={view === 'search' ? 'home' : view}
        onChange={(v) => {
          if (!adLocked) setView(v);
        }}
        disabled={adLocked}
      />

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
          onAdLockChange={setAdLocked}
          initialVideoId={selectedVideoId}
          shareOrigin={import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin}
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
          onPlayVideo={handlePlayVideo}
        />
      )}

      {view === 'settings' && (
        <SettingsScreen
          tier={tier}
          onBack={() => setView('profile')}
          onRequireAuth={() => setAuthOpen(true)}
          onSignOut={signOut}
          onOpenAdmin={() => setView('admin')}
          onOpenTerms={() => setView('terms')}
          onOpenPrivacy={() => setView('privacy')}
          onDeleted={() => {
            setProfileRefreshKey((k) => k + 1);
            setView('home');
          }}
        />
      )}

      {view === 'terms' && <TermsScreen onBack={() => setView('settings')} />}
      {view === 'privacy' && <PrivacyScreen onBack={() => setView('settings')} />}

      {view === 'admin' && <AdminDashboard onBack={() => setView('settings')} />}

      {view === 'support' && <SupportScreen onBack={() => setView('profile')} />}

      {view === 'editProfile' && (
        <EditProfileScreen
          onBack={() => setView('profile')}
          onSaved={(savedName) => {
            setProfileRefreshKey((k) => k + 1);
            setView('profile');
            toast.success(savedName ? `You're in, ${savedName}.` : 'Profile updated. Smooth.');
          }}
        />
      )}

      <BottomNav
        activeView={view === 'search' ? 'home' : view}
        disabled={adLocked}
        onChange={(v) => {
          if (adLocked) return;
          if (v === 'profile') {
            setView('profile');
          } else {
            setView(v);
          }
        }}
      />
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
