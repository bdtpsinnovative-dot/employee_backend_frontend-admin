-- Migration to add is_starred column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;
