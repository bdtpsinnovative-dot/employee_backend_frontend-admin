package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// SubtaskRepo exposes the new Task -> Subtask -> Check item API while reusing
// task_sub_items, which already contains the project's existing subtask data.
type SubtaskRepo struct {
	db *sqlx.DB
}

func NewSubtaskRepo(db *sqlx.DB) *SubtaskRepo {
	return &SubtaskRepo{db: db}
}

func (r *SubtaskRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.TaskSubItem, error) {
	const query = `
		SELECT id, task_id, card_id, title, description, is_done, status, priority,
		       sort_order, created_at, updated_at, start_date, due_date, link_url,
		       attachment_url, verification_notes, admin_comment
		FROM public.task_sub_items
		WHERE task_id = $1
		ORDER BY sort_order, created_at
	`
	subtasks := make([]domain.TaskSubItem, 0)
	if err := r.db.SelectContext(ctx, &subtasks, query, taskID); err != nil {
		return nil, err
	}

	for i := range subtasks {
		items, err := r.listCheckItems(ctx, subtasks[i].ID)
		if err != nil {
			return nil, err
		}
		subtasks[i].CheckItems = items
	}
	return subtasks, nil
}

func (r *SubtaskRepo) Create(
	ctx context.Context,
	taskID uuid.UUID,
	title, description, priority string,
	dueDate *string,
) (*domain.TaskSubItem, error) {
	const query = `
		INSERT INTO public.task_sub_items
			(task_id, title, description, priority, due_date, status, is_done, sort_order)
		VALUES
			($1, $2, $3, $4, NULLIF($5, '')::date, 'pending', false,
			 COALESCE((SELECT MAX(sort_order) + 1 FROM public.task_sub_items WHERE task_id = $1), 0))
		RETURNING id, task_id, card_id, title, description, is_done, status, priority,
		          sort_order, created_at, updated_at, start_date, due_date, link_url,
		          attachment_url, verification_notes, admin_comment
	`
	var subtask domain.TaskSubItem
	var due string
	if dueDate != nil {
		due = *dueDate
	}
	if err := r.db.GetContext(ctx, &subtask, query, taskID, title, description, priority, due); err != nil {
		return nil, err
	}
	subtask.CheckItems = make([]domain.SubtaskCheckItem, 0)
	return &subtask, nil
}

func (r *SubtaskRepo) Update(
	ctx context.Context,
	id uuid.UUID,
	status, adminComment *string,
) (*domain.TaskSubItem, error) {
	const query = `
		UPDATE public.task_sub_items
		SET status = COALESCE($2, status),
		    is_done = CASE
		        WHEN $2 = 'completed' THEN true
		        WHEN $2 IS NOT NULL THEN false
		        ELSE is_done
		    END,
		    admin_comment = COALESCE($3, admin_comment),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, task_id, card_id, title, description, is_done, status, priority,
		          sort_order, created_at, updated_at, start_date, due_date, link_url,
		          attachment_url, verification_notes, admin_comment
	`
	var subtask domain.TaskSubItem
	if err := r.db.GetContext(ctx, &subtask, query, id, status, adminComment); err != nil {
		return nil, err
	}
	items, err := r.listCheckItems(ctx, id)
	if err != nil {
		return nil, err
	}
	subtask.CheckItems = items
	return &subtask, nil
}

func (r *SubtaskRepo) Delete(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM public.task_sub_items WHERE id = $1`, id)
	return affectedOrNotFound(result, err)
}

func (r *SubtaskRepo) CreateCheckItem(ctx context.Context, subtaskID uuid.UUID, title string) (*domain.SubtaskCheckItem, error) {
	const query = `
		INSERT INTO public.subtask_check_items (subtask_id, title, sort_order)
		VALUES ($1, $2,
			COALESCE((SELECT MAX(sort_order) + 1 FROM public.subtask_check_items WHERE subtask_id = $1), 0))
		RETURNING *
	`
	var item domain.SubtaskCheckItem
	if err := r.db.GetContext(ctx, &item, query, subtaskID, title); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *SubtaskRepo) UpdateCheckItem(ctx context.Context, id uuid.UUID, isDone *bool, title *string) (*domain.SubtaskCheckItem, error) {
	const query = `
		UPDATE public.subtask_check_items
		SET is_done = COALESCE($2, is_done),
		    title = COALESCE($3, title),
		    updated_at = NOW()
		WHERE id = $1
		RETURNING *
	`
	var item domain.SubtaskCheckItem
	if err := r.db.GetContext(ctx, &item, query, id, isDone, title); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *SubtaskRepo) DeleteCheckItem(ctx context.Context, id uuid.UUID) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM public.subtask_check_items WHERE id = $1`, id)
	return affectedOrNotFound(result, err)
}

func (r *SubtaskRepo) listCheckItems(ctx context.Context, subtaskID uuid.UUID) ([]domain.SubtaskCheckItem, error) {
	items := make([]domain.SubtaskCheckItem, 0)
	err := r.db.SelectContext(ctx, &items, `
		SELECT * FROM public.subtask_check_items
		WHERE subtask_id = $1
		ORDER BY sort_order, created_at
	`, subtaskID)
	return items, err
}

func affectedOrNotFound(result sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, sql.ErrNoRows)
}
