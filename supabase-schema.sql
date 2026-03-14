-- ============================================================
--  CommAssess — Supabase Schema
--  Paste this into: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ---- 1. TRAINEES (mirrors auth.users for easy admin listing) ----
CREATE TABLE IF NOT EXISTS trainees (
  id          UUID        PRIMARY KEY,           -- same as auth.users.id
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---- 2. TOPICS (created by admin) ----
CREATE TABLE IF NOT EXISTS topics (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  module            TEXT        NOT NULL,        -- 'pick-speak', 'mock-call', etc.
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL DEFAULT '',
  scenario          TEXT        NOT NULL DEFAULT '',
  checklist         JSONB       NOT NULL DEFAULT '[]',
  caller_audio_url  TEXT,                        -- Supabase Storage public URL
  bot_script        JSONB       NOT NULL DEFAULT '[]',  -- ordered customer lines for turn-based mock call
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS topics_module_idx ON topics(module);

-- ---- 3. SESSIONS (one per trainee assessment attempt) ----
CREATE TABLE IF NOT EXISTS sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee_id      UUID        REFERENCES trainees(id) ON DELETE SET NULL,
  trainee_name    TEXT        NOT NULL,
  trainee_email   TEXT,
  module          TEXT        NOT NULL,
  topic_id        UUID        REFERENCES topics(id) ON DELETE SET NULL,
  topic_title     TEXT,
  recording_url   TEXT,                          -- Supabase Storage public URL
  transcript      TEXT        NOT NULL DEFAULT '',
  written_text    TEXT,
  ai_scores       JSONB,
  admin_scores    JSONB,
  admin_comment   TEXT        NOT NULL DEFAULT '',
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | ai-evaluated | scored
  time_taken      INTEGER     NOT NULL DEFAULT 0,          -- seconds
  analysis        JSONB,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_trainee_idx ON sessions(trainee_id);
CREATE INDEX IF NOT EXISTS sessions_module_idx  ON sessions(module);
CREATE INDEX IF NOT EXISTS sessions_status_idx  ON sessions(status);

-- ---- 4. SETTINGS (key-value store) ----
CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- Default admin password (change after first login via Settings panel)
INSERT INTO settings (key, value) VALUES ('adminPassword', 'admin123')
  ON CONFLICT (key) DO NOTHING;


-- ============================================================
--  ROW LEVEL SECURITY
--  This is an internal corporate tool — we use permissive
--  policies so the anon key works without authentication.
--  Enable only if you want to restrict to logged-in users.
-- ============================================================

-- Topics: publicly readable (trainees need topics), writable by authenticated
ALTER TABLE topics    ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topics_read_all"  ON topics    FOR SELECT USING (true);
CREATE POLICY "topics_write_auth" ON topics   FOR ALL    TO authenticated USING (true);

-- Trainees: publicly readable (admin dashboard needs full list), writable by authenticated
ALTER TABLE trainees  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trainees_read_all"   ON trainees  FOR SELECT USING (true);
CREATE POLICY "trainees_write_auth" ON trainees  FOR ALL    TO authenticated USING (true);

-- Sessions: readable by all, writable by authenticated
ALTER TABLE sessions  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessions_read_all"   ON sessions  FOR SELECT USING (true);
CREATE POLICY "sessions_write_auth" ON sessions  FOR ALL    TO authenticated USING (true);

-- Settings: readable by all (admin password check), writable by authenticated
ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read_all"   ON settings  FOR SELECT USING (true);
CREATE POLICY "settings_write_auth" ON settings  FOR ALL    TO authenticated USING (true);


-- ============================================================
--  STORAGE BUCKETS
--  Run these OR create buckets manually via the Supabase
--  dashboard (Storage tab) and set them to PUBLIC.
-- ============================================================

-- Uncomment if your Supabase plan supports storage via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('recordings',   'recordings',   true) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('caller-audio', 'caller-audio', true) ON CONFLICT DO NOTHING;

-- ============================================================
--  DONE. After running:
--  1. Go to Storage → create buckets "recordings" and
--     "caller-audio", set both to Public.
--  2. Go to Authentication → Settings → disable email
--     confirmation (for internal team use).
-- ============================================================
