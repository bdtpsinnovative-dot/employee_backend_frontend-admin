-- Migration 031: keep Sales work isolated from ordinary tasks.
-- Existing rows remain in the general workspace through the default value.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'general';

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_workspace_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_workspace_check
  CHECK (workspace IN ('general', 'sales'));

CREATE INDEX IF NOT EXISTS tasks_workspace_active_created_at_idx
  ON tasks (workspace, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN tasks.workspace IS
  'Task area: general for normal tasks, sales for tasks created from the Sales workspace.';
