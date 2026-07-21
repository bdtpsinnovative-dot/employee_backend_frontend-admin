-- Migration 010: Add detailed fields to task_sub_items for startDate, dueDate, linkUrl, attachmentUrl, and verificationNotes
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS link_url TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS verification_notes TEXT;
