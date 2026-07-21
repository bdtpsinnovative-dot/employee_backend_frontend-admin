-- Migration 012: เพิ่มคอลัมน์ description, start_date, due_date ให้กับตาราง task_lists
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
