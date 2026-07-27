-- Migration 015: Ensure all schema columns exist for task_sub_items and task_cards
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS verification_notes TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;

ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS admin_comment TEXT;
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
