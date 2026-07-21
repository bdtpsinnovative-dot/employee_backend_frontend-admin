-- Migration 011: เพิ่ม start_date และ due_date ให้กับตาราง task_cards
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
