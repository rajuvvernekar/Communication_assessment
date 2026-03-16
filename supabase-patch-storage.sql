-- ============================================================
--  CommAssess — Patch: Storage bucket + upload policies
--  Paste into: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Create the recordings bucket (safe if already exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('recordings', 'recordings', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anonymous users to upload recordings
CREATE POLICY "recordings_anon_insert" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'recordings');

-- Allow anyone to read recordings (bucket is public)
CREATE POLICY "recordings_anon_select" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'recordings');

-- ============================================================
--  DONE. Recordings will now upload and play back in admin.
-- ============================================================
