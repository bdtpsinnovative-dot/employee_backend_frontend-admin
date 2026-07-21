-- Migration 007: เพิ่ม task_assignees table สำหรับรองรับผู้รับผิดชอบหลายคนต่อ 1 งาน

CREATE TABLE IF NOT EXISTS task_assignees (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_assignees UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id  ON task_assignees(user_id);

-- backfill: ใส่ assigned_to เดิมเข้าไปใน task_assignees ด้วย
INSERT INTO task_assignees (task_id, user_id)
SELECT id, assigned_to FROM tasks
ON CONFLICT DO NOTHING;
