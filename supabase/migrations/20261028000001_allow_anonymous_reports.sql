-- Allow reporter_id to be nullable for anonymous guest reports
ALTER TABLE reports ALTER COLUMN reporter_id DROP NOT NULL;

-- Flag whether the report was submitted by an unauthenticated guest
ALTER TABLE reports ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false;

-- Allow anonymous inserts through RLS if marked as anonymous and reporter_id is null
DROP POLICY IF EXISTS "insert_anonymous_report" ON reports;
CREATE POLICY "insert_anonymous_report" ON reports FOR INSERT
  TO anon
  WITH CHECK (is_anonymous = true AND reporter_id IS NULL);
