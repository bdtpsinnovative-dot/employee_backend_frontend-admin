-- Store the reason for each database save point so admins can identify it later.
ALTER TABLE backup_jobs
    ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
