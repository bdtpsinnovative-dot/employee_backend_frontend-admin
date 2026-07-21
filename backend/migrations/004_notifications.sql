-- 004_notifications.sql
-- สร้างตาราง notifications สำหรับเก็บประวัติการแจ้งเตือนของแต่ละพนักงาน

CREATE TABLE IF NOT EXISTS notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL,
    body       TEXT        NOT NULL DEFAULT '',
    type       TEXT        NOT NULL DEFAULT 'system',  -- 'leave' | 'attendance' | 'system' | 'announcement'
    is_read    BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index เพื่อให้ query ต่อ user_id เร็ว (เรียงจากใหม่สุด)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_created
    ON notifications (user_id, created_at DESC);
