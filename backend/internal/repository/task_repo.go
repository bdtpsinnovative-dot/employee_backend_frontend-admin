package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

type TaskRepo struct {
	db *sqlx.DB
}

func NewTaskRepo(db *sqlx.DB) *TaskRepo {
	return &TaskRepo{db: db}
}

func (r *TaskRepo) populateAssigneeIDs(ctx context.Context, tasks []domain.Task) ([]domain.Task, error) {
	if len(tasks) == 0 {
		return tasks, nil
	}
	// Fetch all assignees for these tasks
	var assignees []struct {
		TaskID uuid.UUID `db:"task_id"`
		UserID uuid.UUID `db:"user_id"`
	}
	err := r.db.SelectContext(ctx, &assignees, `SELECT task_id, user_id FROM task_assignees`)
	if err != nil {
		return nil, err
	}
	taskMap := make(map[uuid.UUID][]uuid.UUID)
	for _, a := range assignees {
		taskMap[a.TaskID] = append(taskMap[a.TaskID], a.UserID)
	}
	for i, t := range tasks {
		ids := taskMap[t.ID]
		if ids == nil {
			ids = []uuid.UUID{}
		}
		// Fallback to assigned_to if assignee_ids is empty for backwards compatibility
		if len(ids) == 0 && t.AssignedTo != uuid.Nil {
			ids = append(ids, t.AssignedTo)
		}
		tasks[i].AssigneeIDs = ids
	}
	return tasks, nil
}

func (r *TaskRepo) ListAll(ctx context.Context) ([]domain.Task, error) {
	var tasks []domain.Task
	err := r.db.SelectContext(ctx, &tasks, `
		SELECT t.id, t.assigned_to, t.title, t.description, t.due_date, t.status, t.assigned_by,
		       t.brand_id, t.category_id, t.created_at,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id), 0) AS card_total,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id AND tc.status = 'completed'), 0) AS card_done
		FROM tasks t
		ORDER BY t.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	return r.populateAssigneeIDs(ctx, tasks)
}

func (r *TaskRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Task, error) {
	var tasks []domain.Task
	err := r.db.SelectContext(ctx, &tasks, `
		SELECT DISTINCT t.id, t.assigned_to, t.title, t.description, t.due_date, t.status, t.assigned_by,
		       t.brand_id, t.category_id, t.created_at,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id), 0) AS card_total,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id AND tc.status = 'completed'), 0) AS card_done
		FROM tasks t
		LEFT JOIN task_assignees ta ON t.id = ta.task_id
		WHERE t.assigned_to = $1 OR ta.user_id = $1
		ORDER BY t.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	return r.populateAssigneeIDs(ctx, tasks)
}

func (r *TaskRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	var task domain.Task
	err := r.db.GetContext(ctx, &task, `
		SELECT id, assigned_to, title, description, due_date, status, assigned_by,
		       brand_id, category_id, created_at 
		FROM tasks 
		WHERE id = $1
	`, id)
	if err != nil {
		return nil, err
	}
	tasks, err := r.populateAssigneeIDs(ctx, []domain.Task{task})
	if err != nil {
		return nil, err
	}
	return &tasks[0], nil
}

func (r *TaskRepo) Create(ctx context.Context, t *domain.Task) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO tasks (id, assigned_to, title, description, due_date, status, assigned_by, brand_id, category_id, created_at)
		VALUES (:id, :assigned_to, :title, :description, :due_date, :status, :assigned_by, :brand_id, :category_id, NOW())
	`, t)
	if err != nil {
		return err
	}

	// Insert all assignees into task_assignees
	for _, userID := range t.AssigneeIDs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO task_assignees (task_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, t.ID, userID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *TaskRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks SET status = $1 WHERE id = $2
	`, status, id)
	return err
}

func (r *TaskRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM tasks WHERE id = $1
	`, id)
	return err
}
