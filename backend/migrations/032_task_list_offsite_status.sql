-- Migration 032: allow work lists to represent off-site work.

ALTER TABLE task_lists
  DROP CONSTRAINT IF EXISTS task_lists_status_check;

ALTER TABLE task_lists
  ADD CONSTRAINT task_lists_status_check
  CHECK (status IN ('waiting', 'pending', 'in_progress', 'offsite', 'in_review', 'completed', 'revision'));
