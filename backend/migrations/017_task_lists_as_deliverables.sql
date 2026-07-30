-- Treat legacy task_lists as project deliverables.
-- The change is additive: task_cards and task_sub_items remain untouched so
-- existing data can be restored to the UI in the future.

ALTER TABLE task_lists
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress',
    ADD COLUMN IF NOT EXISTS admin_comment TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE task_lists DROP CONSTRAINT IF EXISTS task_lists_priority_check;
ALTER TABLE task_lists
    ADD CONSTRAINT task_lists_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE task_lists DROP CONSTRAINT IF EXISTS task_lists_status_check;
ALTER TABLE task_lists
    ADD CONSTRAINT task_lists_status_check
    CHECK (status IN ('pending', 'in_progress', 'in_review', 'completed'));

CREATE TABLE IF NOT EXISTS list_assignees (
    list_id UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (list_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_list_assignees_user_id
    ON list_assignees(user_id);

CREATE INDEX IF NOT EXISTS idx_task_lists_active_task_order
    ON task_lists(task_id, sort_order, created_at)
    WHERE deleted_at IS NULL;
