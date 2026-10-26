/*
# Avatar storage policies and profile display fields

1. Modified Tables
- `profiles`: adds `bio` (text, nullable) — short user biography shown on profile.
  `display_name` already exists and is used for the username-style handle.
  Note: avatar_url is derived from storage path when needed; profiles store the
  public URL directly as `avatar_url` (text, nullable) — added idempotently.

2. Storage
- Creates owner-scoped policies on the `avatars` bucket: authenticated users can
  upload/update/delete files inside their own `<user-id>/` folder, and everyone
  can view avatars (public bucket, needed to render profiles).

3. Security
- All policies are owner-scoped; the bucket itself is public-read only.
*/

-- Profile columns (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- Storage policies for the avatars bucket (owner-scoped writes, public reads)
DROP POLICY IF EXISTS "public_read_avatars" ON storage.objects;
CREATE POLICY "public_read_avatars" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "user_upload_own_avatar" ON storage.objects;
CREATE POLICY "user_upload_own_avatar" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "user_update_own_avatar" ON storage.objects;
CREATE POLICY "user_update_own_avatar" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "user_delete_own_avatar" ON storage.objects;
CREATE POLICY "user_delete_own_avatar" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
