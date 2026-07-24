package repository

import (
	"context"
	"fmt"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
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
	var taskIDs []uuid.UUID
	for _, t := range tasks {
		taskIDs = append(taskIDs, t.ID)
	}

	// Fetch all assignees for these tasks in batch
	var assignees []struct {
		TaskID uuid.UUID `db:"task_id"`
		UserID uuid.UUID `db:"user_id"`
	}

	query, args, err := sqlx.In(`SELECT task_id, user_id FROM task_assignees WHERE task_id IN (?)`, taskIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	err = r.db.SelectContext(ctx, &assignees, query, args...)
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
		if len(ids) == 0 && t.AssignedTo != nil && *t.AssignedTo != uuid.Nil {
			ids = append(ids, *t.AssignedTo)
		}
		tasks[i].AssigneeIDs = ids
	}
	return tasks, nil
}

func (r *TaskRepo) populateLatestSubmissions(ctx context.Context, tasks []domain.Task) ([]domain.Task, error) {
	if len(tasks) == 0 {
		return tasks, nil
	}
	// Just fetch the latest submission for each task
	// This could be optimized, but N queries for N tasks is okay if N is small, or we can use DISTINCT ON
	var allSubs []domain.TaskSubmission
	err := r.db.SelectContext(ctx, &allSubs, `
		SELECT DISTINCT ON (task_id) *
		FROM task_submissions
		ORDER BY task_id, submitted_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to populate latest submissions: %w", err)
	}
	subMap := make(map[uuid.UUID]domain.TaskSubmission)
	for _, s := range allSubs {
		subMap[s.TaskID] = s
	}
	for i, t := range tasks {
		if sub, ok := subMap[t.ID]; ok {
			tasks[i].LatestSubmission = &sub
		}
	}
	return tasks, nil
}

func (r *TaskRepo) populateSubItems(ctx context.Context, tasks []domain.Task) ([]domain.Task, error) {
	if len(tasks) == 0 {
		return tasks, nil
	}
	var subItems []struct {
		domain.TaskSubItem
		TaskID uuid.UUID `db:"task_id"`
	}
	err := r.db.SelectContext(ctx, &subItems, `
		SELECT id, task_id, title, is_done, sort_order
		FROM task_sub_items
		WHERE card_id IS NULL
		ORDER BY sort_order ASC, created_at ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to populate sub-items: %w", err)
	}
	subMap := make(map[uuid.UUID][]domain.TaskSubItem)
	for _, s := range subItems {
		subMap[s.TaskID] = append(subMap[s.TaskID], s.TaskSubItem)
	}
	for i, t := range tasks {
		if items, ok := subMap[t.ID]; ok {
			tasks[i].SubItems = items
		} else {
			tasks[i].SubItems = []domain.TaskSubItem{}
		}
	}
	return tasks, nil
}

func (r *TaskRepo) ListAll(ctx context.Context) ([]domain.Task, error) {
	var tasks []domain.Task
	err := r.db.SelectContext(ctx, &tasks, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.status, t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id), 0) AS card_total,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id AND tc.status = 'completed'), 0) AS card_done,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		ORDER BY 
			t.category_id NULLS LAST,
			CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END ASC,
			t.due_date ASC NULLS LAST,
			t.created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	tasks, err = r.populateAssigneeIDs(ctx, tasks)
	if err != nil {
		return nil, err
	}
	tasks, err = r.populateLatestSubmissions(ctx, tasks)
	if err != nil {
		return nil, err
	}
	return r.populateSubItems(ctx, tasks)
}

func (r *TaskRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Task, error) {
	var tasks []domain.Task
	err := r.db.SelectContext(ctx, &tasks, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.status, t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE t.project_id = $1
		ORDER BY 
			t.group_id NULLS LAST,
			CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END ASC,
			t.due_date ASC NULLS LAST,
			t.created_at DESC
	`, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks by project: %w", err)
	}
	tasks, err = r.populateAssigneeIDs(ctx, tasks)
	if err != nil {
		return nil, err
	}
	tasks, err = r.populateLatestSubmissions(ctx, tasks)
	if err != nil {
		return nil, err
	}
	return r.populateSubItems(ctx, tasks)
}

func (r *TaskRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Task, error) {
	var tasks []domain.Task
	err := r.db.SelectContext(ctx, &tasks, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.status, t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id), 0) AS card_total,
		       COALESCE((SELECT COUNT(*) FROM task_cards tc JOIN task_lists tl ON tc.list_id = tl.id WHERE tl.task_id = t.id AND tc.status = 'completed'), 0) AS card_done,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE t.assigned_to = $1 
		   OR t.assigned_by = $1
		   OR EXISTS (
		       SELECT 1 FROM task_assignees ta 
		       WHERE ta.task_id = t.id AND ta.user_id = $1
		   )
		ORDER BY 
			t.category_id NULLS LAST,
			CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END ASC,
			t.due_date ASC NULLS LAST,
			t.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	tasks, err = r.populateAssigneeIDs(ctx, tasks)
	if err != nil {
		return nil, err
	}
	tasks, err = r.populateLatestSubmissions(ctx, tasks)
	if err != nil {
		return nil, err
	}
	return r.populateSubItems(ctx, tasks)
}

func (r *TaskRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	var task domain.Task
	err := r.db.GetContext(ctx, &task, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.status, t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE t.id = $1
	`, id)
	if err != nil {
		return nil, err
	}
	tasks, err := r.populateAssigneeIDs(ctx, []domain.Task{task})
	if err != nil {
		return nil, err
	}
	tasks, err = r.populateLatestSubmissions(ctx, tasks)
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

	if (t.AssignedTo == nil || *t.AssignedTo == uuid.Nil) && len(t.AssigneeIDs) > 0 {
		t.AssignedTo = &t.AssigneeIDs[0]
	}

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO tasks (id, assigned_to, title, description, due_date, status, assigned_by, brand_id, category_id, project_id, group_id, created_at)
		VALUES (:id, :assigned_to, :title, :description, :due_date, :status, :assigned_by, :brand_id, :category_id, :project_id, :group_id, NOW())
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

		// An assignee must also be a project member, otherwise the task appears
		// in "My Tasks" but its parent project is hidden from their project list.
		if t.ProjectID != nil {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO project_members (project_id, user_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
			`, *t.ProjectID, userID)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (r *TaskRepo) Update(ctx context.Context, t *domain.Task) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var assignedTo *uuid.UUID
	if len(t.AssigneeIDs) > 0 {
		assignedTo = &t.AssigneeIDs[0]
	}
	t.AssignedTo = assignedTo

	// Update main task details including assigned_to
	_, err = tx.ExecContext(ctx, `
		UPDATE tasks 
		SET title = $1, 
		    description = $2, 
		    due_date = $3, 
		    brand_id = $4, 
		    category_id = $5,
		    assigned_to = $6
		WHERE id = $7
	`, t.Title, t.Description, t.DueDate, t.BrandID, t.CategoryID, assignedTo, t.ID)
	if err != nil {
		return err
	}

	// Delete old assignees
	_, err = tx.ExecContext(ctx, `DELETE FROM task_assignees WHERE task_id = $1`, t.ID)
	if err != nil {
		return err
	}

	// Insert new assignees
	for _, userID := range t.AssigneeIDs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO task_assignees (task_id, user_id)
			VALUES ($1, $2)
		`, t.ID, userID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *TaskRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	var err error
	if status == "completed" {
		_, err = r.db.ExecContext(ctx, `
			UPDATE tasks SET status = $1, completed_at = NOW(), needs_revision = FALSE WHERE id = $2
		`, status, id)
	} else {
		_, err = r.db.ExecContext(ctx, `
			UPDATE tasks SET status = $1 WHERE id = $2
		`, status, id)
	}
	return err
}

func (r *TaskRepo) UpdateNeedsRevision(ctx context.Context, id uuid.UUID, needsRevision bool) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks SET needs_revision = $1 WHERE id = $2
	`, needsRevision, id)
	return err
}

func (r *TaskRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM tasks WHERE id = $1
	`, id)
	return err
}

func (r *TaskRepo) CreateTaskEvent(ctx context.Context, e *domain.TaskEvent) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_events (id, task_id, user_id, event_type, action, content, created_at)
		VALUES (:id, :task_id, :user_id, :event_type, :action, :content, NOW())
	`, e)
	return err
}

func (r *TaskRepo) ListTaskEvents(ctx context.Context, taskID uuid.UUID) ([]domain.TaskEvent, error) {
	query := `
		SELECT te.id, te.task_id, te.user_id, te.event_type, te.action, te.content, te.created_at,
		       u.first_name, u.last_name, u.avatar_url,
		       COALESCE(t.title, '') AS task_title
		FROM task_events te
		LEFT JOIN users u ON te.user_id = u.id
		LEFT JOIN tasks t ON te.task_id = t.id
		WHERE te.task_id = $1
		ORDER BY te.created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to query task events: %w", err)
	}
	defer rows.Close()

	var events []domain.TaskEvent
	for rows.Next() {
		var ev domain.TaskEvent
		if err := rows.Scan(
			&ev.ID, &ev.TaskID, &ev.UserID, &ev.EventType, &ev.Action, &ev.Content, &ev.CreatedAt,
			&ev.UserFirstName, &ev.UserLastName, &ev.UserAvatarURL, &ev.TaskTitle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task event: %w", err)
		}
		events = append(events, ev)
	}
	return events, nil
}

// ListAllTaskEvents ดึงประวัติของทุกงาน (สำหรับหน้ารวม Activity Log) เรียงจากใหม่ไปเก่า
func (r *TaskRepo) ListAllTaskEvents(ctx context.Context) ([]domain.TaskEvent, error) {
	query := `
		SELECT te.id, te.task_id, te.user_id, te.event_type, te.action, te.content, te.created_at,
		       u.first_name, u.last_name, u.avatar_url,
		       COALESCE(t.title, '') AS task_title
		FROM task_events te
		LEFT JOIN users u ON te.user_id = u.id
		LEFT JOIN tasks t ON te.task_id = t.id
		ORDER BY te.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query all task events: %w", err)
	}
	defer rows.Close()

	var events []domain.TaskEvent
	for rows.Next() {
		var ev domain.TaskEvent
		if err := rows.Scan(
			&ev.ID, &ev.TaskID, &ev.UserID, &ev.EventType, &ev.Action, &ev.Content, &ev.CreatedAt,
			&ev.UserFirstName, &ev.UserLastName, &ev.UserAvatarURL, &ev.TaskTitle,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task event: %w", err)
		}
		events = append(events, ev)
	}
	return events, nil
}

func (r *TaskRepo) CreateTaskSubmission(ctx context.Context, sub *domain.TaskSubmission) error {
	if sub.ID == uuid.Nil {
		sub.ID = uuid.New()
	}
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_submissions (id, task_id, submitted_by, url, version, status, submitted_at, created_at)
		VALUES (:id, :task_id, :submitted_by, :url, :version, :status, NOW(), NOW())
	`, sub)
	return err
}

func (r *TaskRepo) GetTaskSubmissions(ctx context.Context, taskID uuid.UUID) ([]domain.TaskSubmission, error) {
	var subs []domain.TaskSubmission
	err := r.db.SelectContext(ctx, &subs, `
		SELECT * FROM task_submissions WHERE task_id = $1 ORDER BY submitted_at DESC
	`, taskID)
	if err != nil {
		return nil, err
	}
	return subs, nil
}

func (r *TaskRepo) UpdateSubmissionStatus(ctx context.Context, id uuid.UUID, status string, reviewerID uuid.UUID, note *string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE task_submissions 
		SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_note = $3
		WHERE id = $4
	`, status, reviewerID, note, id)
	return err
}
