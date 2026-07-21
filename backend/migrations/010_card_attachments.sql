-- Migration 010: สร้างตาราง card_attachments สำหรับเก็บไฟล์แนบในการ์ด (แยกออกจาก sub-items)
CREATE TABLE IF NOT EXISTS card_attachments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id    UUID NOT NULL REFERENCES task_cards(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    name       TEXT NOT NULL DEFAULT '',
    type       TEXT NOT NULL DEFAULT 'file' CHECK (type IN ('image', 'file', 'link')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON card_attachments(card_id);
