package repository

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// TaskEventRepo stores the immutable activity trail for tasks, lists, cards,
// sub-items, comments, and attachments.
type TaskEventRepo struct {
	db *sqlx.DB
}

func NewTaskEventRepo(db *sqlx.DB) *TaskEventRepo {
	return &TaskEventRepo{db: db}
}

func (r *TaskEventRepo) EnsureTable(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS task_events (
			id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			task_id     UUID,
			list_id     UUID,
			card_id     UUID,
			sub_item_id UUID,
			user_id     UUID,
			event_type  TEXT NOT NULL DEFAULT 'system' CHECK (event_type IN ('system', 'comment')),
			action      TEXT NOT NULL,
			content     TEXT,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS task_id UUID;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS list_id UUID;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS card_id UUID;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS sub_item_id UUID;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS user_id UUID;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'system';
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS action TEXT NOT NULL DEFAULT 'activity';
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS content TEXT;
		ALTER TABLE task_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
		CREATE INDEX IF NOT EXISTS idx_task_events_task_created
			ON task_events(task_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_task_events_list_created
			ON task_events(list_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_task_events_card_created
			ON task_events(card_id, created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_task_events_sub_item_created
			ON task_events(sub_item_id, created_at DESC);
		CREATE OR REPLACE FUNCTION prevent_task_event_mutation()
		RETURNS TRIGGER AS $$
		BEGIN
			RAISE EXCEPTION 'task_events is append-only';
		END;
		$$ LANGUAGE plpgsql;
		DROP TRIGGER IF EXISTS task_events_immutable ON task_events;
		CREATE TRIGGER task_events_immutable
			BEFORE UPDATE OR DELETE ON task_events
			FOR EACH ROW EXECUTE FUNCTION prevent_task_event_mutation();
	`)
	return err
}

func (r *TaskEventRepo) Create(ctx context.Context, event *domain.TaskEvent) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_events (
			id, task_id, list_id, card_id, sub_item_id, user_id,
			event_type, action, content, created_at
		) VALUES (
			:id, :task_id, :list_id, :card_id, :sub_item_id, :user_id,
			:event_type, :action, :content, :created_at
		)
	`, event)
	return err
}

func (r *TaskEventRepo) ListByTask(
	ctx context.Context,
	taskID uuid.UUID,
	listID *uuid.UUID,
	cardID *uuid.UUID,
) ([]domain.TaskEvent, error) {
	events := make([]domain.TaskEvent, 0)
	err := r.db.SelectContext(ctx, &events, `
		SELECT
			e.id, e.task_id, e.list_id, e.card_id, e.sub_item_id, e.user_id,
			e.event_type, e.action, e.content, e.created_at,
			COALESCE(u.first_name, '') AS user_first_name,
			COALESCE(u.last_name, '') AS user_last_name,
			COALESCE(u.avatar_url, '') AS user_avatar_url,
			COALESCE(t.title, '') AS task_title,
			COALESCE(l.name, '') AS list_name,
			COALESCE(c.title, '') AS card_title
		FROM task_events e
		LEFT JOIN users u ON u.id = e.user_id
		LEFT JOIN tasks t ON t.id = e.task_id
		LEFT JOIN task_lists l ON l.id = e.list_id
		LEFT JOIN task_cards c ON c.id = e.card_id
		WHERE e.task_id = $1
		  AND ($2::uuid IS NULL OR e.list_id = $2)
		  AND ($3::uuid IS NULL OR e.card_id = $3)
		ORDER BY e.created_at DESC
		LIMIT 500
	`, taskID, listID, cardID)
	return events, err
}

func (r *TaskEventRepo) ListAll(ctx context.Context) ([]domain.TaskEvent, error) {
	events := make([]domain.TaskEvent, 0)
	err := r.db.SelectContext(ctx, &events, `
		SELECT
			e.id, e.task_id, e.list_id, e.card_id, e.sub_item_id, e.user_id,
			e.event_type, e.action, e.content, e.created_at,
			COALESCE(u.first_name, '') AS user_first_name,
			COALESCE(u.last_name, '') AS user_last_name,
			COALESCE(u.avatar_url, '') AS user_avatar_url,
			COALESCE(t.title, '') AS task_title,
			COALESCE(l.name, '') AS list_name,
			COALESCE(c.title, '') AS card_title
		FROM task_events e
		LEFT JOIN users u ON u.id = e.user_id
		LEFT JOIN tasks t ON t.id = e.task_id
		LEFT JOIN task_lists l ON l.id = e.list_id
		LEFT JOIN task_cards c ON c.id = e.card_id
		ORDER BY e.created_at DESC
		LIMIT 2000
	`)
	return events, err
}

// TaskEventScope resolves an entity to its parent task hierarchy before a
// mutation. This is especially important for delete events, where the entity
// can no longer be queried after the operation succeeds.
type TaskEventScope struct {
	TaskID    uuid.UUID  `db:"task_id"`
	ListID    *uuid.UUID `db:"list_id"`
	CardID    *uuid.UUID `db:"card_id"`
	SubItemID *uuid.UUID `db:"sub_item_id"`
	Name      string     `db:"name"`
}

func (r *TaskEventRepo) ScopeForList(ctx context.Context, listID uuid.UUID) (*TaskEventScope, error) {
	var scope TaskEventScope
	err := r.db.GetContext(ctx, &scope, `
		SELECT task_id, id AS list_id, NULL::uuid AS card_id,
		       NULL::uuid AS sub_item_id, name
		FROM task_lists WHERE id = $1
	`, listID)
	return &scope, err
}

func (r *TaskEventRepo) ScopeForCard(ctx context.Context, cardID uuid.UUID) (*TaskEventScope, error) {
	var scope TaskEventScope
	err := r.db.GetContext(ctx, &scope, `
		SELECT l.task_id, c.list_id, c.id AS card_id,
		       NULL::uuid AS sub_item_id, c.title AS name
		FROM task_cards c
		JOIN task_lists l ON l.id = c.list_id
		WHERE c.id = $1
	`, cardID)
	return &scope, err
}

func (r *TaskEventRepo) ScopeForSubItem(ctx context.Context, subItemID uuid.UUID) (*TaskEventScope, error) {
	var scope TaskEventScope
	err := r.db.GetContext(ctx, &scope, `
		SELECT s.task_id, c.list_id, s.card_id, s.id AS sub_item_id,
		       s.title AS name
		FROM task_sub_items s
		LEFT JOIN task_cards c ON c.id = s.card_id
		WHERE s.id = $1
	`, subItemID)
	return &scope, err
}

func (r *TaskEventRepo) ScopeForAttachment(ctx context.Context, attachmentID uuid.UUID) (*TaskEventScope, error) {
	var scope TaskEventScope
	err := r.db.GetContext(ctx, &scope, `
		SELECT l.task_id, c.list_id, a.card_id, NULL::uuid AS sub_item_id,
		       COALESCE(NULLIF(a.name, ''), a.url) AS name
		FROM card_attachments a
		JOIN task_cards c ON c.id = a.card_id
		JOIN task_lists l ON l.id = c.list_id
		WHERE a.id = $1
	`, attachmentID)
	return &scope, err
}
