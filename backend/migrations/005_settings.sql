-- ============================================================
-- NexHR Database Schema - Migration 005: Global Settings
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert default check-in mode setting if it doesn't exist
INSERT INTO settings (key, value) 
VALUES ('checkin_mode', 'face') 
ON CONFLICT (key) DO NOTHING;
