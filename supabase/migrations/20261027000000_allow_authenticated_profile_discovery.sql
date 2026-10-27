/*
  Comments and other social surfaces need public profile identity without
  exposing auth.users. Profile fields are intentionally app-public to signed-in
  members; account credentials remain protected in auth.users.
*/
DROP POLICY IF EXISTS "authenticated_read_profiles" ON profiles;
CREATE POLICY "authenticated_read_profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);
