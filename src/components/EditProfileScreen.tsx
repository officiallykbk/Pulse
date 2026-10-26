import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Camera, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/services/supabase';
import type { Profile } from '@/types';

interface EditProfileScreenProps {
  onBack: () => void;
  onSaved: () => void;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxDim = 512;
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not compress image'));
      },
      'image/jpeg',
      0.85
    );
  });
}

export function EditProfileScreen({ onBack, onSaved }: EditProfileScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameCheck, setNameCheck] = useState<'idle' | 'taken' | 'ok'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
        setBio(data.bio ?? '');
        setAvatarPreview(data.avatar_url ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (!displayName.trim() || (profile && displayName.trim() === (profile.display_name ?? ''))) {
      setNameCheck('idle');
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('display_name', displayName.trim())
        .maybeSingle();
      setNameCheck(data && (!profile || data.id !== profile.id) ? 'taken' : 'ok');
    }, 400);
    return () => clearTimeout(timeout);
  }, [displayName, profile]);

  const handlePickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Avatar must be a JPG, PNG, or WebP image');
      return;
    }
    setError(null);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not signed in');
      return;
    }
    if (nameCheck === 'taken') {
      setError('That display name is already taken');
      return;
    }

    setSaving(true);
    setError(null);

    let avatarUrl: string | undefined;
    if (avatarFile) {
      try {
        const compressed = await compressImage(avatarFile);
        if (compressed.size > MAX_AVATAR_BYTES) {
          setError('Avatar too large after compression — try a smaller image');
          setSaving(false);
          return;
        }
        const ext = 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
        avatarUrl = `${publicUrl}?v=${Date.now()}`; // bust cache after re-upload
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Avatar upload failed');
        setSaving(false);
        return;
      }
    }

    const updates: Record<string, unknown> = {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
    };
    if (avatarUrl) updates.avatar_url = avatarUrl;

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSaved();
  };

  const dirty =
    (profile ? displayName !== (profile.display_name ?? '') : displayName !== '') ||
    (profile ? bio !== (profile.bio ?? '') : bio !== '') ||
    avatarFile !== null;

  return (
    <div className="min-h-full bg-black px-4 pb-24" style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top))' }}>
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised transition-colors active:bg-surface-elevated"
          >
            <ArrowLeft className="h-5 w-5 text-white" />
          </button>
          <h1 className="text-xl font-bold text-white">Edit Profile</h1>
        </div>

        <div className="mb-6 flex flex-col items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="group relative h-24 w-24 overflow-hidden rounded-full bg-surface-elevated"
          >
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-white/30">
                {(displayName || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-active:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </span>
          </button>
          <p className="mt-2 text-xs text-white/40">Tap to change photo (JPG/PNG, auto-compressed)</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePickAvatar}
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Display Name</label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={30}
                placeholder="How should we show you?"
                className="w-full rounded-lg bg-surface-raised px-4 py-3 pr-10 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
              />
              {nameCheck === 'taken' && (
                <AlertCircle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-error" />
              )}
              {nameCheck === 'ok' && (
                <Check className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-success" />
              )}
            </div>
            {nameCheck === 'taken' && (
              <p className="mt-1 text-xs text-error">That name is taken</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-white/80">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={160}
              placeholder="Accra. Short films. Good vibes."
              className="w-full rounded-lg bg-surface-raised px-4 py-3 text-white placeholder-white/30 outline-none ring-1 ring-white/10 focus:ring-accent"
            />
            <p className="mt-1 text-right text-xs text-white/30">{bio.length}/160</p>
          </div>

          {error && (
            <p className="rounded-lg bg-error/15 px-3 py-2 text-sm text-error">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !dirty || nameCheck === 'taken'}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3.5 font-semibold text-white transition-colors active:bg-accent-hover disabled:opacity-40"
          >
            {saving && <Loader2 className="h-5 w-5 animate-spin" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
