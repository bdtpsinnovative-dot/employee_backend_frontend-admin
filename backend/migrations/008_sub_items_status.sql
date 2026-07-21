-- Migration 008: เพิ่ม status ใน task_sub_items เพื่อรองรับ Trello-style 3 columns
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- backfill existing data
UPDATE task_sub_items SET status = 'completed' WHERE is_done = TRUE;
UPDATE task_sub_items SET status = 'pending' WHERE is_done = FALSE AND status IS NULL;
