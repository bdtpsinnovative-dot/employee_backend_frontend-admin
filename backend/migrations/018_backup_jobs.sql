-- Migration 018: Admin database snapshot and restore job tracking
CREATE TABLE IF NOT EXISTS backup_jobs (
    id                  UUID PRIMARY KEY,
    operation           TEXT NOT NULL CHECK (operation IN ('backup', 'restore')),
    status              TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    schema_version      TEXT NOT NULL,
    database_object_key TEXT,
    manifest_object_key TEXT,
    table_manifest_object_key TEXT,
    source_backup_id    UUID,
    triggered_by        UUID,
    file_count          INTEGER NOT NULL DEFAULT 0,
    database_size_bytes BIGINT NOT NULL DEFAULT 0,
    description         TEXT NOT NULL DEFAULT '',
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ
);

ALTER TABLE backup_jobs
    ADD COLUMN IF NOT EXISTS table_manifest_object_key TEXT;

ALTER TABLE backup_jobs
    DROP CONSTRAINT IF EXISTS backup_jobs_source_backup_id_fkey;

CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at ON backup_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON backup_jobs(status);
CREATE INDEX IF NOT EXISTS idx_backup_jobs_operation ON backup_jobs(operation);
