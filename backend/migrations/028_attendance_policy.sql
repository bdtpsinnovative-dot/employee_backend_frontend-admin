-- Attendance policy expansion.
--
-- This migration is intentionally expand-only so the currently released
-- backend and mobile app can continue to run while the new backend/app are
-- deployed. Attendance metadata lives in a separate table because the old
-- backend uses SELECT * against attendance and sqlx rejects unknown columns.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS work_start_time TIME NOT NULL DEFAULT TIME '09:00',
    ADD COLUMN IF NOT EXISTS work_end_time TIME NOT NULL DEFAULT TIME '18:00';

DO $work_schedule_constraint$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'users_work_schedule_order_check'
          AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_work_schedule_order_check
            CHECK (work_end_time > work_start_time);
    END IF;
END
$work_schedule_constraint$;

ALTER TABLE work_locations
    ALTER COLUMN radius_m SET DEFAULT 100;

-- Protect historical location references even while an older backend version
-- (whose DELETE endpoint issued a physical DELETE) is still serving traffic.
CREATE OR REPLACE FUNCTION soft_disable_work_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE work_locations SET is_active = FALSE WHERE id = OLD.id;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_soft_disable_work_location ON work_locations;
CREATE TRIGGER trg_soft_disable_work_location
BEFORE DELETE ON work_locations
FOR EACH ROW EXECUTE FUNCTION soft_disable_work_location();

CREATE TABLE IF NOT EXISTS attendance_metadata (
    attendance_id UUID PRIMARY KEY REFERENCES attendance(id) ON DELETE CASCADE,
    scheduled_start TIME NOT NULL DEFAULT TIME '09:00',
    scheduled_end TIME NOT NULL DEFAULT TIME '18:00',
    is_workday BOOLEAN NOT NULL DEFAULT TRUE,
    is_offsite BOOLEAN NOT NULL DEFAULT FALSE,
    late_minutes INTEGER NOT NULL DEFAULT 0 CHECK (late_minutes >= 0),
    check_in_location_name TEXT,
    check_in_distance_m NUMERIC(10, 2) CHECK (check_in_distance_m >= 0),
    check_in_accuracy_m NUMERIC(10, 2) CHECK (check_in_accuracy_m >= 0),
    check_out_location_id UUID REFERENCES work_locations(id) ON DELETE SET NULL,
    check_out_location_name TEXT,
    check_out_distance_m NUMERIC(10, 2) CHECK (check_out_distance_m >= 0),
    check_out_accuracy_m NUMERIC(10, 2) CHECK (check_out_accuracy_m >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_metadata_checkout_location_id
    ON attendance_metadata(check_out_location_id);

-- Backfill legacy rows with the policy that was active before per-user
-- schedules existed. Keep the original attendance.status untouched.
INSERT INTO attendance_metadata (
    attendance_id,
    scheduled_start,
    scheduled_end,
    is_workday,
    is_offsite,
    late_minutes,
    check_in_location_name
)
SELECT
    a.id,
    TIME '09:00',
    TIME '18:00',
    EXTRACT(ISODOW FROM a.date) BETWEEN 1 AND 5
        AND NOT EXISTS (
            SELECT 1
            FROM holidays h
            WHERE a.date BETWEEN h.date AND h.date + (GREATEST(COALESCE(h.num_days, 1), 1) - 1)
        ),
    a.status = 'offsite',
    CASE
        WHEN a.status = 'late' AND a.check_in_at IS NOT NULL THEN
            GREATEST(
                FLOOR(
                    EXTRACT(EPOCH FROM (
                        (a.check_in_at AT TIME ZONE 'Asia/Bangkok')::time - TIME '09:00'
                    )) / 60
                )::INTEGER,
                0
            )
        ELSE 0
    END,
    wl.name
FROM attendance a
LEFT JOIN work_locations wl ON wl.id = a.location_id
ON CONFLICT (attendance_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_attendance_id_created_at
    ON attendance_audit_logs(attendance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_changed_by
    ON attendance_audit_logs(changed_by);

-- These tables are internal to the Go backend and must not become direct Data
-- API surfaces. The backend's database role retains access.
ALTER TABLE attendance_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_audit_logs ENABLE ROW LEVEL SECURITY;

DO $attendance_security$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE attendance_metadata FROM anon;
        REVOKE ALL ON TABLE attendance_audit_logs FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE attendance_metadata FROM authenticated;
        REVOKE ALL ON TABLE attendance_audit_logs FROM authenticated;
    END IF;
END
$attendance_security$;
