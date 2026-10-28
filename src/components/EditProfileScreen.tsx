import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Camera, Check, AlertCircle, Loader2, Dices } from 'lucide-react';
import { supabase } from '@/services/supabase';
import type { Profile } from '@/types';
import { AKAN_NAME_DAYS, createUsernameSuggestions, type UsernameStyle } from '@/lib/ghanaianNames';
import { GeneratedAvatar } from '@/components/GeneratedAvatar';

interface EditProfileScreenProps {
  onBack: () => void;
  onSaved: (displayName: string) => void;
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
  const [usernameStyle, setUsernameStyle] = useState<UsernameStyle>('ghanaian');
  const [birthWeekday, setBirthWeekday] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState(() =>
    createUsernameSuggestions({ style: 'ghanaian' }),
  );
  const [rollingNames, setRollingNames] = useState(false);
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

    onSaved(displayName.trim());
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
              <GeneratedAvatar name={displayName || profile?.display_name || 'Pulse member'} className="h-full w-full text-2xl" />
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
            <div className="mt-3 rounded-xl bg-surface-raised/70 p-3">
              <p className="mb-2 text-xs font-medium text-white/55">Choose a name style</p>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/30 p-1">
                {([
                  ['traditional', 'Traditional'],
                  ['ghanaian', 'Modern'],
                  ['global', 'Global'],
                ] as const).map(([style, label]) => (
                  <button
                    type="button"
                    key={style}
                    aria-pressed={usernameStyle === style}
                    onClick={() => {
                      setUsernameStyle(style);
                      setNameSuggestions(createUsernameSuggestions({ style, birthWeekday }));
                    }}
                    className={`rounded-md px-2 py-2 text-[11px] font-medium transition-colors ${
                      usernameStyle === style ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/75'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mb-3 mt-2 text-[11px] leading-relaxed text-white/40">
                {usernameStyle === 'traditional'
                  ? 'Akan day names are tied to the weekday you were born. Choose the weekday only; no birth date is collected.'
                  : usernameStyle === 'ghanaian'
                    ? 'Positive words paired with researched Twi names for animals and places, plus Ghanaian culture.'
                    : 'Tech-inspired names with a more global feel.'}
              </p>
              {usernameStyle === 'traditional' && (
                <label className="mb-3 block text-xs text-white/65">
                  Weekday you were born
                  <select
                    value={birthWeekday}
                    onChange={(event) => {
                      const weekday = event.target.value;
                      setBirthWeekday(weekday);
                      setNameSuggestions(createUsernameSuggestions({
                        style: 'traditional',
                        birthWeekday: weekday,
                        exclude: displayName ? [displayName] : [],
                      }));
                    }}
                    className="mt-1.5 w-full rounded-lg bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-accent"
                  >
                    <option value="">Choose a weekday</option>
                    {AKAN_NAME_DAYS.map(({ day }) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </label>
              )}
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-white/70">Three name ideas</p>
                <button
                  type="button"
                  aria-label="Reroll name suggestions"
                  disabled={usernameStyle === 'traditional' && !birthWeekday}
                  onClick={() => {
                    setRollingNames(true);
                    setNameSuggestions(createUsernameSuggestions({
                      style: usernameStyle,
                      birthWeekday,
                      exclude: [displayName, ...nameSuggestions],
                    }));
                    window.setTimeout(() => setRollingNames(false), 450);
                  }}
                  className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-accent transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Dices className={`h-3.5 w-3.5 ${rollingNames ? 'animate-dice-shake' : ''}`} />
                  <span>Reroll</span>
                  <span className="sr-only" aria-live="polite">
                    {rollingNames ? 'Generating new name ideas...' : ''}
                  </span>
                </button>
              </div>
              <div aria-live="polite" aria-atomic="true" className="flex flex-wrap gap-2">
                {nameSuggestions.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => setDisplayName(suggestion)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      displayName === suggestion
                        ? 'border-accent/70 bg-accent/15 text-white'
                        : 'border-white/10 text-white/80 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {nameSuggestions.length > 0 ? (
                <p className="mt-2 text-[11px] text-white/60">Pick one, then edit it however you like.</p>
              ) : (
                <p className="mt-2 text-[11px] text-white/60">Choose your birth weekday to see the matching Akan day names.</p>
              )}
            </div>
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
