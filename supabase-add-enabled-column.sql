-- Run this once in Supabase SQL Editor → SQL Editor → New Query
-- Adds the enabled/disabled toggle column to the topics table

ALTER TABLE topics ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true;
