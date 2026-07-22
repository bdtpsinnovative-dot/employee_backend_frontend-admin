-- ============================================================
-- NexHR Database Schema - Task Events (Activity Logs) Migration
-- Target: Supabase (PostgreSQL 15+)
-- Date: 2026-07-22
-- ============================================================

CREATE TABLE IF NOT EXISTS task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('comment', 'system')),
    action TEXT NOT NULL, -- e.g. 'created_task', 'status_changed', 'commented'
    content TEXT, -- the text of the comment or the details of the change
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON task_events(created_at);
