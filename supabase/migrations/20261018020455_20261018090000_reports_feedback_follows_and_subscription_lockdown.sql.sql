/*
# Production readiness: reports, feedback, follows + subscription security lockdown

1. New Tables
- `reports`: content reports submitted by users.
  - `id` (uuid, primary key)
  - `video_id` (uuid, nullable — the reported video)
  - `reported_user_id` (uuid, nullable — the reported profile owner)
  - `reporter_id` (uuid, not null, defaults to the authenticated user)
  - `reason` (text, not null — short category, e.g. "inappropriate", "spam")
  - `details` (text, nullable — free-text extra info)
  - `status` (text, not null, default 'open' — open / reviewed / dismissed)
  - `created_at` (timestamp)

- `feedback`: support messages and bug reports.
  - `id` (uuid, primary key)
  - `user_id` (uuid, nullable — null allows signed-out visitors to send feedback)
  - `email` (text, nullable — contact address if not signed in)
  - `category` (text, not null, default 'general' — general / bug / feature)
  - `message` (text, not null)
  - `status` (text, not null, default 'open')
  - `created_at` (timestamp)

- `follows`: follow relationships between users.
  - `id` (uuid, primary key)
  - `follower_id` (uuid, not null, defaults to the authenticated user — the one who follows)
  - `following_id` (uuid, not null — the one being followed)
  - `created_at` (timestamp)
  - Unique constraint prevents duplicate follow rows.

2. Modified Tables
- `subscriptions`: REMOVED the overly permissive insert policy that let any authenticated
  user insert their own subscription row (self-granting Pro for free). The verified
  payment process uses the service role (bypasses RLS), so no insert policy is needed.
  Users keep read access to their own subscription rows.
- `videos`: REMOVED the anon INSERT/UPDATE/DELETE grants and INSERT policy was already
  authenticated-scoped; anon users never need to write videos.

3. Security
- RLS enabled on all three new tables.
- `reports`: authenticated users insert their own reports (reporter_id defaults to
  auth.uid()); users read only their own reports; no update/delete for users —
  moderation happens server-side later.
- `feedback`: anyone (anon or authenticated) can insert; users read only their own.
- `follows`: authenticated users insert/delete their own follow relationships;
  all users can read follows (needed to render follower counts on public profiles).

4. Important Notes
- Subscription upgrades now REQUIRE server-side Paystack verification (edge function
  using the service role). The frontend can no longer create subscription rows.
- Subscription REREAD: the select policy stays so users can see their own status.
*/

-- ============ New tables ============

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id),
  CONSTRAINT unique_follow_pair UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_video ON reports(video_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- ============ RLS ============

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

-- Reports: users can create and view their own; no user-side update/delete.
DROP POLICY IF EXISTS "insert_own_report" ON reports;
CREATE POLICY "insert_own_report" ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "select_own_reports" ON reports;
CREATE POLICY "select_own_reports" ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = reporter_id);

-- Feedback: anyone can submit; users can read their own submissions.
DROP POLICY IF EXISTS "insert_feedback" ON feedback;
CREATE POLICY "insert_feedback" ON feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "select_own_feedback" ON feedback;
CREATE POLICY "select_own_feedback" ON feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Follows: authenticated CRUD on own relationships; public read for counts.
DROP POLICY IF EXISTS "insert_own_follows" ON follows;
CREATE POLICY "insert_own_follows" ON follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "delete_own_follows" ON follows;
CREATE POLICY "delete_own_follows" ON follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

DROP POLICY IF EXISTS "select_follows" ON follows;
CREATE POLICY "select_follows" ON follows FOR SELECT
  TO anon, authenticated
  USING (true);

-- ============ Subscription lockdown ============
-- Remove the self-grant insert path. Verified payments (edge function, service role)
-- will insert subscription rows, bypassing RLS by design.

DROP POLICY IF EXISTS "insert_own_subscriptions" ON subscriptions;

-- ============ Videos: anon must not write ============

REVOKE INSERT, UPDATE, DELETE ON videos FROM anon;
