-- Migration 030: Add platforms column to tasks table
-- platforms text[] stores social media platform targets for content tasks
-- e.g. {'facebook', 'instagram', 'tiktok'}

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS platforms text[] DEFAULT '{}';

COMMENT ON COLUMN tasks.platforms IS 'Social media platforms for content tasks (facebook, instagram, tiktok, youtube, lemon8, line, x, other)';
