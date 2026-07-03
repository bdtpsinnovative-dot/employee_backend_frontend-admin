-- ============================================================
-- NexHR Database Schema - Migration 002: Leave Quotas
-- ============================================================

CREATE TABLE IF NOT EXISTS leave_quotas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year            INTEGER NOT NULL,
    sick_leave      INTEGER NOT NULL DEFAULT 30,
    personal_leave  INTEGER NOT NULL DEFAULT 6,
    annual_leave    INTEGER NOT NULL DEFAULT 6,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one quota record per user per year
    UNIQUE(user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_quotas_user_year ON leave_quotas(user_id, year);

-- Use the existing update_updated_at_column() function from 001
CREATE TRIGGER set_leave_quotas_updated_at
    BEFORE UPDATE ON leave_quotas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
