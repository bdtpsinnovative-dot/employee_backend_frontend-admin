-- Immutable server-side activity log for all task/board/card mutations.
-- IDs intentionally do not have foreign keys so deletion history is retained.
CREATE TABLE IF NOT EXISTS task_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID,
    list_id     UUID,
    card_id     UUID,
    sub_item_id UUID,
    user_id     UUID,
    event_type  TEXT NOT NULL DEFAULT 'system',
    action      TEXT NOT NULL,
    content     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_events ADD COLUMN IF NOT EXISTS task_id UUID;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS list_id UUID;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS card_id UUID;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS sub_item_id UUID;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'system';
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'activity';
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE task_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_task_events_task_created
    ON task_events(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_list_created
    ON task_events(list_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_card_created
    ON task_events(card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_events_sub_item_created
    ON task_events(sub_item_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_task_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'task_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_events_immutable ON task_events;
CREATE TRIGGER task_events_immutable
    BEFORE UPDATE OR DELETE ON task_events
    FOR EACH ROW EXECUTE FUNCTION prevent_task_event_mutation();
