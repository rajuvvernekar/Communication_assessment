-- ============================================================
--  CommAssess — AI Audit Scores Table
--  Paste into: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_audit_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  self_assessment_score numeric,
  ai_audit_score numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS with public access (matches existing tables)
ALTER TABLE ai_audit_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public access" ON ai_audit_scores;
CREATE POLICY "Public access" ON ai_audit_scores
  FOR ALL USING (true) WITH CHECK (true);
