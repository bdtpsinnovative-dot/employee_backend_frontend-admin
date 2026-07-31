-- Migration 025: add starring support to tasks.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;
