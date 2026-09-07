-- ============================================================
--  CommAssess — Patch: Remove auth requirement for trainees
--  Paste into: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Make email nullable (no longer collected)
ALTER TABLE trainees ALTER COLUMN email DROP NOT NULL;

-- 2. Add employee_id column (was missing from original schema)
ALTER TABLE trainees ADD COLUMN IF NOT EXISTS employee_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS trainees_employee_id_idx
  ON trainees(employee_id) WHERE employee_id IS NOT NULL;

-- 3. Open up all write policies to the anon role
--    (this tool is internal — no public internet exposure expected)
DROP POLICY IF EXISTS "trainees_write_auth" ON trainees;
CREATE POLICY "trainees_write_anon" ON trainees FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "sessions_write_auth" ON sessions;
CREATE POLICY "sessions_write_anon" ON sessions FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "topics_write_auth" ON topics;
CREATE POLICY "topics_write_anon" ON topics FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "settings_write_auth" ON settings;
CREATE POLICY "settings_write_anon" ON settings FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
--  DONE. The trainee app no longer requires Supabase Auth.
-- ============================================================
