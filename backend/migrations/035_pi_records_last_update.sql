-- Add last_update to pi_records
ALTER TABLE pi_records ADD COLUMN IF NOT EXISTS last_update TEXT NOT NULL DEFAULT '';
