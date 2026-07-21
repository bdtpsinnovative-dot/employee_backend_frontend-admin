-- Migration 013: เพิ่มฟิลด์ admin_comment ในตาราง task_cards และ task_sub_items
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;
