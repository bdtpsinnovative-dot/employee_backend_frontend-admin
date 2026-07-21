-- Migration 009: สร้างตารางสำหรับ Trello-style Board (Lists, Cards, Sub-items)
CREATE TABLE IF NOT EXISTS task_lists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_cards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id     UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ปรับปรุง task_sub_items ให้เชื่อมโยงกับ task_cards
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_task_lists_task_id ON task_lists(task_id);
CREATE INDEX IF NOT EXISTS idx_task_cards_list_id ON task_cards(list_id);
CREATE INDEX IF NOT EXISTS idx_task_sub_items_card_id ON task_sub_items(card_id);
