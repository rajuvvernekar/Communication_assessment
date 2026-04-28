-- ============================================================
--  CommAssess — Add archived column to sessions
--  Paste into: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

-- Index so filtering active/archived is fast at scale
CREATE INDEX IF NOT EXISTS sessions_archived_idx ON sessions(archived);
