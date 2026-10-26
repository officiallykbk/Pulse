import { useState, useEffect } from 'react';
import {
  Crown,
  LogOut,
  Mail,
  Settings as SettingsIcon,
  User as UserIcon,
  Eye,
  Heart,
  Film,
  LogIn,
  Pencil,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/services/supabase';
import { APP_IDENTITY } from '@/config/appIdentity';
import type { Video, UserTier, Profile } from '@/types';

interface FollowedCreator {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ProfileScreenProps {
  email: string | null;
  tier: UserTier;
  uploadedVideos: Video[];
  likedVideos: Video[];
  loadingVideos: boolean;
  onUpgrade: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onOpenSettings: () => void;
  onOpenEditProfile: () => void;
  refreshKey: number;
}

const TIER_LABELS: Record<UserTier, string> = {
  anonymous: 'Anonymous',
  free: 'Free Member',
  pro: 'Pro Member',
};

const TIER_COLORS: Record<UserTier, string> = {
  anonymous: 'text-white/50',
  free: 'text-white',
  pro: 'text-accent',
};

function VideoListItem({ video }: { video: Video }) {
  const formatCount = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-elevated p-2">
      <div className="h-14 w-24 flex-shrink-0 overflow-hidden rounded-md bg-black">
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt={video.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film className="h-5 w-5 text-white/20" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-medium text-white">{video.title}</h4>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" />
            {formatCount(video.view_count)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" />
            {formatCount(video.like_count)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ProfileScreen({
  email,
  tier,
  uploadedVideos,
  likedVideos,
  loadingVideos,
  onUpgrade,
  onSignIn,
  onSignOut,
  onOpenSettings,
  onOpenEditProfile,
  refreshKey,
}: ProfileScreenProps) {
  const [tab, setTab] = useState<'uploads' | 'likes' | 'following'>('uploads');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [followedCreators, setFollowedCreators] = useState<FollowedCreator[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
      if (!user) {
        setProfile(null);
        setFollowers(0);
        setFollowing(0);
        return;
      }

      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => setProfile(data));

      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', user.id)
        .then(({ count }) => setFollowers(count ?? 0));

      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', user.id)
        .then(({ count }) => setFollowing(count ?? 0));

      supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .then(async ({ data: followRows }) => {
          const ids = (followRows ?? []).map((r) => r.following_id);
          if (ids.length === 0) {
            setFollowedCreators([]);
            return;
          }
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url')
            .in('id', ids);
          setFollowedCreators(profiles ?? []);
        });
    });
  }, [refreshKey]);

  if (!email) {
    return (
      <div className="min-h-full bg-black px-4 pb-24" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto max-w-sm">
          <h1 className="mb-6 text-2xl font-bold text-white">Profile</h1>
          <div className="flex flex-col items-center rounded-card bg-surface-raised p-8">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-elevated">
              <UserIcon className="h-8 w-8 text-white/40" />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-white">Not signed in</h2>
            <p className="mb-6 text-center text-sm text-white/50">
              Sign in to upload videos, like content, and get fewer ads
            </p>
            <button
              onClick={onSignIn}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors active:bg-accent-hover"
            >
              <LogIn className="h-5 w-5" />
              Sign In or Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-black px-4 pb-24" style={{ paddingTop: 'max(2rem, env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenEditProfile}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
              aria-label="Edit profile"
            >
              <Pencil className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={onOpenSettings}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-card bg-surface-raised p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-surface-elevated">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <UserIcon className="h-7 w-7 text-white/60" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-white">
                {profile?.display_name ?? APP_IDENTITY.defaultMemberName}
              </p>
              <p className={`text-sm ${TIER_COLORS[tier]}`}>
                {TIER_LABELS[tier]}
                {tier === 'pro' && <Crown className="ml-1 inline h-3.5 w-3.5" />}
              </p>
            </div>
          </div>

          {profile?.bio && (
            <p className="mb-4 text-sm leading-relaxed text-white/70">{profile.bio}</p>
          )}

          <div className="mb-4 flex items-center gap-5 text-sm">
            <div>
              <span className="font-semibold text-white">{uploadedVideos.length}</span>
              <span className="ml-1 text-white/40">videos</span>
            </div>
            <div>
              <span className="font-semibold text-white">{followers}</span>
              <span className="ml-1 text-white/40">followers</span>
            </div>
            <div>
              <span className="font-semibold text-white">{following}</span>
              <span className="ml-1 text-white/40">following</span>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-surface-elevated px-3 py-2.5">
            <Mail className="h-4 w-4 text-white/40" />
            <span className="truncate text-sm text-white/70">{email}</span>
          </div>
        </div>

        {tier === 'pro' ? (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-full bg-accent/15 py-3.5 font-semibold text-accent">
            <Crown className="h-5 w-5" />
            Pro Active — Ad-Free
          </div>
        ) : (
          <button
            onClick={onUpgrade}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors active:bg-accent-hover"
          >
            <Crown className="h-5 w-5" />
            Upgrade to Pro
          </button>
        )}

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTab('uploads')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
              tab === 'uploads' ? 'bg-surface-raised text-white' : 'text-white/40'
            }`}
          >
            My Videos ({uploadedVideos.length})
          </button>
          <button
            onClick={() => setTab('likes')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
              tab === 'likes' ? 'bg-surface-raised text-white' : 'text-white/40'
            }`}
          >
            Liked ({likedVideos.length})
          </button>
          <button
            onClick={() => setTab('following')}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
              tab === 'following' ? 'bg-surface-raised text-white' : 'text-white/40'
            }`}
          >
            Following ({following})
          </button>
        </div>

        {loadingVideos && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        )}

        {!loadingVideos && tab === 'uploads' && uploadedVideos.length === 0 && (
          <div className="py-8 text-center">
            <Film className="mx-auto mb-2 h-8 w-8 text-white/15" />
            <p className="text-sm text-white/40">You haven't uploaded any videos yet</p>
          </div>
        )}

        {!loadingVideos && tab === 'likes' && likedVideos.length === 0 && (
          <div className="py-8 text-center">
            <Heart className="mx-auto mb-2 h-8 w-8 text-white/15" />
            <p className="text-sm text-white/40">Videos you like will appear here</p>
          </div>
        )}

        {!loadingVideos && tab === 'following' && followedCreators.length === 0 && (
          <div className="py-8 text-center">
            <UserIcon className="mx-auto mb-2 h-8 w-8 text-white/15" />
            <p className="text-sm text-white/40">Creators you follow will appear here</p>
          </div>
        )}

        {!loadingVideos && tab === 'following' && followedCreators.length > 0 && (
          <div className="space-y-2">
            {followedCreators.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg bg-surface-elevated p-2">
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-black">
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt={c.display_name ?? 'Creator'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserIcon className="h-5 w-5 text-white/30" />
                    </div>
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">
                  {c.display_name || APP_IDENTITY.defaultMemberName}
                </span>
                <button
                  onClick={async () => {
                    await supabase
                      .from('follows')
                      .delete()
                      .eq('follower_id', userId)
                      .eq('following_id', c.id);
                    setFollowedCreators((prev) => prev.filter((x) => x.id !== c.id));
                    setFollowing((n) => Math.max(0, n - 1));
                  }}
                  className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors active:text-white"
                >
                  Following
                </button>
              </div>
            ))}
          </div>
        )}

        {!loadingVideos && tab === 'uploads' && uploadedVideos.length > 0 && (
          <div className="space-y-2">
            {uploadedVideos.map((v) => (
              <VideoListItem key={v.id} video={v} />
            ))}
          </div>
        )}

        {!loadingVideos && tab === 'likes' && likedVideos.length > 0 && (
          <div className="space-y-2">
            {likedVideos.map((v) => (
              <VideoListItem key={v.id} video={v} />
            ))}
          </div>
        )}

        <button
          onClick={onSignOut}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 py-3.5 font-medium text-white/70 transition-colors active:border-white/30 active:text-white"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </div>
  );
}
