package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/perf"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type TaskRepo struct {
	db *sqlx.DB
}

func NewTaskRepo(db *sqlx.DB) *TaskRepo {
	return &TaskRepo{db: db}
}

func (r *TaskRepo) ValidateAssignees(
	ctx context.Context,
	assigneeIDs []uuid.UUID,
	projectID *uuid.UUID,
) error {
	return r.validateAssignees(ctx, assigneeIDs, projectID)
}

// ValidateActiveAssignees validates assignment targets during task updates.
// The update transaction adds them to the project when needed, so requiring
// project membership before that transaction would make adding a new person
// impossible.
func (r *TaskRepo) ValidateActiveAssignees(ctx context.Context, assigneeIDs []uuid.UUID) error {
	return r.validateAssignees(ctx, assigneeIDs, nil)
}

func (r *TaskRepo) validateAssignees(
	ctx context.Context,
	assigneeIDs []uuid.UUID,
	projectID *uuid.UUID,
) error {
	if len(assigneeIDs) == 0 {
		return fmt.Errorf("at least one assignee is required")
	}

	uniqueIDs := make(map[uuid.UUID]struct{}, len(assigneeIDs))
	for _, id := range assigneeIDs {
		if id == uuid.Nil {
			return fmt.Errorf("invalid assignee")
		}
		uniqueIDs[id] = struct{}{}
	}
	if len(uniqueIDs) != len(assigneeIDs) {
		return fmt.Errorf("duplicate assignee")
	}

	query := `
		SELECT COUNT(*)
		FROM users u
		WHERE u.id IN (?)
		  AND u.status = 'active'
	`
	args := []any{assigneeIDs}
	if projectID != nil {
		query += `
		  AND EXISTS (
		    SELECT 1 FROM project_members pm
		    WHERE pm.project_id = ? AND pm.user_id = u.id
		  )
		`
		args = append(args, *projectID)
	}

	query, boundArgs, err := sqlx.In(query, args...)
	if err != nil {
		return err
	}
	query = r.db.Rebind(query)

	var validCount int
	if err := r.db.GetContext(ctx, &validCount, query, boundArgs...); err != nil {
		return err
	}
	if validCount != len(assigneeIDs) {
		return fmt.Errorf("assignees must be active project members")
	}
	return nil
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

type taskQueryRow struct {
	domain.Task
	AssigneeIDsJSON      []byte `db:"assignee_ids_json"`
	LatestSubmissionJSON []byte `db:"latest_submission_json"`
	SubItemsJSON         []byte `db:"sub_items_json"`
	ListsJSON            []byte `db:"lists_json"`
}

func decodeTaskRows(rows []taskQueryRow) ([]domain.Task, error) {
	tasks := make([]domain.Task, len(rows))
	for i := range rows {
		task := rows[i].Task
		task.AssigneeIDs = []uuid.UUID{}
		task.SubItems = []domain.TaskSubItem{}
		task.Lists = []domain.TaskList{}

		if err := json.Unmarshal(rows[i].AssigneeIDsJSON, &task.AssigneeIDs); err != nil {
			return nil, fmt.Errorf("decode task assignees: %w", err)
		}
		if len(rows[i].LatestSubmissionJSON) > 0 && string(rows[i].LatestSubmissionJSON) != "null" {
			var submission domain.TaskSubmission
			if err := json.Unmarshal(rows[i].LatestSubmissionJSON, &submission); err != nil {
				return nil, fmt.Errorf("decode latest task submission: %w", err)
			}
			task.LatestSubmission = &submission
		}
		if err := json.Unmarshal(rows[i].SubItemsJSON, &task.SubItems); err != nil {
			return nil, fmt.Errorf("decode task sub-items: %w", err)
		}
		if err := json.Unmarshal(rows[i].ListsJSON, &task.Lists); err != nil {
			return nil, fmt.Errorf("decode task lists: %w", err)
		}
		if len(task.AssigneeIDs) == 0 && task.AssignedTo != nil && *task.AssignedTo != uuid.Nil {
			task.AssigneeIDs = append(task.AssigneeIDs, *task.AssignedTo)
		}
		tasks[i] = task
	}
	return tasks, nil
}

func (r *TaskRepo) ListAll(ctx context.Context) ([]domain.Task, error) {
	var rows []taskQueryRow
	measureDB := perf.MeasureDB(ctx, "db.tasks.base")
	err := r.db.SelectContext(ctx, &rows, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.attachment_url,
		       CASE
				   WHEN t.status = 'completed' THEN 'completed'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) = 0 THEN 'pending'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0)
					 = COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) THEN 'in_review'
				   ELSE 'in_progress'
			   END AS status,
		       t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at, t.is_starred,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
	       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) AS card_total,
	       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0) AS card_done,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count,
		       COALESCE((SELECT jsonb_agg(to_jsonb(ta.user_id) ORDER BY ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id), '[]'::jsonb) AS assignee_ids_json,
		       COALESCE((SELECT to_jsonb(ts) FROM task_submissions ts WHERE ts.task_id = t.id ORDER BY ts.submitted_at DESC LIMIT 1), 'null'::jsonb) AS latest_submission_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.sort_order, si.created_at) FROM task_sub_items si WHERE si.task_id = t.id AND si.card_id IS NULL), '[]'::jsonb) AS sub_items_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(tl) ORDER BY tl.sort_order, tl.created_at) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), '[]'::jsonb) AS lists_json
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE t.deleted_at IS NULL
		ORDER BY 
			t.category_id NULLS LAST,
			CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END ASC,
			t.due_date ASC NULLS LAST,
			t.created_at DESC
	`)
	measureDB()
	if err != nil {
		return nil, err
	}
	return decodeTaskRows(rows)
}

func (r *TaskRepo) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Task, error) {
	var rows []taskQueryRow
	measureDB := perf.MeasureDB(ctx, "db.tasks.base")
	err := r.db.SelectContext(ctx, &rows, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.attachment_url,
		       CASE
				   WHEN t.status = 'completed' THEN 'completed'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) = 0 THEN 'pending'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0)
					 = COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) THEN 'in_review'
				   ELSE 'in_progress'
			   END AS status,
		       t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at, t.is_starred,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count,
		       COALESCE((SELECT jsonb_agg(to_jsonb(ta.user_id) ORDER BY ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id), '[]'::jsonb) AS assignee_ids_json,
		       COALESCE((SELECT to_jsonb(ts) FROM task_submissions ts WHERE ts.task_id = t.id ORDER BY ts.submitted_at DESC LIMIT 1), 'null'::jsonb) AS latest_submission_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.sort_order, si.created_at) FROM task_sub_items si WHERE si.task_id = t.id AND si.card_id IS NULL), '[]'::jsonb) AS sub_items_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(tl) ORDER BY tl.sort_order, tl.created_at) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), '[]'::jsonb) AS lists_json
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
	measureDB()
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks by project: %w", err)
	}
	return decodeTaskRows(rows)
}

func (r *TaskRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Task, error) {
	var rows []taskQueryRow
	measureDB := perf.MeasureDB(ctx, "db.tasks.base")
	err := r.db.SelectContext(ctx, &rows, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.attachment_url,
		       CASE
				   WHEN t.status = 'completed' THEN 'completed'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) = 0 THEN 'pending'
				   WHEN COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0)
					 = COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) THEN 'in_review'
				   ELSE 'in_progress'
			   END AS status,
		       t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at, t.is_starred,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
	       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) AS card_total,
	       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0) AS card_done,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count,
		       COALESCE((SELECT jsonb_agg(to_jsonb(ta.user_id) ORDER BY ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id), '[]'::jsonb) AS assignee_ids_json,
		       COALESCE((SELECT to_jsonb(ts) FROM task_submissions ts WHERE ts.task_id = t.id ORDER BY ts.submitted_at DESC LIMIT 1), 'null'::jsonb) AS latest_submission_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.sort_order, si.created_at) FROM task_sub_items si WHERE si.task_id = t.id AND si.card_id IS NULL), '[]'::jsonb) AS sub_items_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(tl) ORDER BY tl.sort_order, tl.created_at) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), '[]'::jsonb) AS lists_json
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE (t.assigned_to = $1 
		   OR t.assigned_by = $1
		   OR EXISTS (
		       SELECT 1 FROM task_assignees ta 
		       WHERE ta.task_id = t.id AND ta.user_id = $1
		   )) AND t.deleted_at IS NULL
		ORDER BY 
			t.category_id NULLS LAST,
			CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END ASC,
			t.due_date ASC NULLS LAST,
			t.created_at DESC
	`, userID)
	measureDB()
	if err != nil {
		return nil, fmt.Errorf("failed to query tasks: %w", err)
	}
	return decodeTaskRows(rows)
}

func (r *TaskRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	var row taskQueryRow
	measureDB := perf.MeasureDB(ctx, "db.tasks.by_id")
	err := r.db.GetContext(ctx, &row, `
		SELECT t.id, t.project_id, t.group_id, t.assigned_to, t.title, t.description,
		       t.start_date, t.due_date, t.priority, t.attachment_url, t.status, t.record_kind, t.sort_order,
		       t.assigned_by, t.brand_id, t.category_id, t.created_at, t.needs_revision, t.completed_at, t.is_starred,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name,
		       COALESCE(u2.first_name || ' ' || u2.last_name, '') AS assigned_by_name,
		       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), 0) AS card_total,
		       COALESCE((SELECT COUNT(*) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL AND tl.status = 'completed'), 0) AS card_done,
		       COALESCE((SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id), 0) AS submission_count,
		       COALESCE((SELECT jsonb_agg(to_jsonb(ta.user_id) ORDER BY ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id), '[]'::jsonb) AS assignee_ids_json,
		       COALESCE((SELECT to_jsonb(ts) FROM task_submissions ts WHERE ts.task_id = t.id ORDER BY ts.submitted_at DESC LIMIT 1), 'null'::jsonb) AS latest_submission_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(si) ORDER BY si.sort_order, si.created_at) FROM task_sub_items si WHERE si.task_id = t.id AND si.card_id IS NULL), '[]'::jsonb) AS sub_items_json,
		       COALESCE((SELECT jsonb_agg(to_jsonb(tl) ORDER BY tl.sort_order, tl.created_at) FROM task_lists tl WHERE tl.task_id = t.id AND tl.deleted_at IS NULL), '[]'::jsonb) AS lists_json
		FROM tasks t
		LEFT JOIN users u ON t.assigned_to = u.id
		LEFT JOIN users u2 ON t.assigned_by = u2.id
		WHERE t.id = $1 AND t.deleted_at IS NULL
	`, id)
	measureDB()
	if err != nil {
		return nil, err
	}
	tasks, err := decodeTaskRows([]taskQueryRow{row})
	if err != nil {
		return nil, err
	}
	return &tasks[0], nil
}

func (r *TaskRepo) Create(ctx context.Context, t *domain.Task) error {
	return r.CreateWithLists(ctx, t, nil)
}

func (r *TaskRepo) CreateWithLists(ctx context.Context, t *domain.Task, listNames []string) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if (t.AssignedTo == nil || *t.AssignedTo == uuid.Nil) && len(t.AssigneeIDs) > 0 {
		t.AssignedTo = &t.AssigneeIDs[0]
	}

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO tasks (id, assigned_to, title, description, due_date, status, assigned_by, brand_id, category_id, project_id, group_id, priority, attachment_url, created_at)
		VALUES (:id, :assigned_to, :title, :description, :due_date, :status, :assigned_by, :brand_id, :category_id, :project_id, :group_id, :priority, :attachment_url, NOW())
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

	for index, name := range listNames {
		if name == "" {
			continue
		}
		listID := uuid.New()
		_, err = tx.ExecContext(ctx, `
			INSERT INTO task_lists (
				id, task_id, name, description, sort_order, due_date,
				priority, status, admin_comment, attachments, created_at
			)
			VALUES ($1, $2, $3, '', $4, $5, 'medium', 'in_progress', '', '[]'::jsonb, NOW())
		`, listID, t.ID, name, index, t.DueDate)
		if err != nil {
			return err
		}
		for _, userID := range t.AssigneeIDs {
			if _, err = tx.ExecContext(ctx, `
				INSERT INTO list_assignees (list_id, user_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
			`, listID, userID); err != nil {
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
		    assigned_to = $6,
		    priority = $7,
		    status = $8,
		    attachment_url = $9
		WHERE id = $10
	`, t.Title, t.Description, t.DueDate, t.BrandID, t.CategoryID, assignedTo, t.Priority, t.Status, t.AttachmentURL, t.ID)
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

func (r *TaskRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	var err error
	if status == "completed" {
		_, err = r.db.ExecContext(ctx, `
			UPDATE tasks SET status = $1, completed_at = NOW(), needs_revision = FALSE WHERE id = $2
		`, status, id)
	} else {
		_, err = r.db.ExecContext(ctx, `
			UPDATE tasks SET status = $1, completed_at = NULL WHERE id = $2
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
		UPDATE tasks SET deleted_at = NOW() WHERE id = $1
	`, id)
	return err
}

func (r *TaskRepo) ListTrash(ctx context.Context, userID uuid.UUID, isAdmin bool) ([]domain.Task, error) {
	var tasks []domain.Task
	var err error
	if isAdmin {
		err = r.db.SelectContext(ctx, &tasks, `
			SELECT t.id, t.assigned_to, t.title, t.description, t.due_date, t.status, t.assigned_by,
			       t.brand_id, t.category_id, t.created_at, t.deleted_at,
			       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name
			FROM tasks t
			LEFT JOIN users u ON t.assigned_to = u.id
			WHERE t.deleted_at IS NOT NULL
			ORDER BY t.deleted_at DESC
		`)
	} else {
		err = r.db.SelectContext(ctx, &tasks, `
			SELECT DISTINCT t.id, t.assigned_to, t.title, t.description, t.due_date, t.status, t.assigned_by,
			       t.brand_id, t.category_id, t.created_at, t.deleted_at,
			       COALESCE(u.first_name || ' ' || u.last_name, '') AS assigned_to_name
			FROM tasks t
			LEFT JOIN task_assignees ta ON t.id = ta.task_id
			LEFT JOIN users u ON t.assigned_to = u.id
			WHERE (t.assigned_to = $1 OR ta.user_id = $1 OR t.assigned_by = $1) AND t.deleted_at IS NOT NULL
			ORDER BY t.deleted_at DESC
		`, userID)
	}
	if err != nil {
		return nil, err
	}
	return r.populateAssigneeIDs(ctx, tasks)
}

func (r *TaskRepo) Restore(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks SET deleted_at = NULL WHERE id = $1
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

func (r *TaskRepo) GetBrandName(ctx context.Context, id uuid.UUID) (string, error) {
	var name string
	err := r.db.GetContext(ctx, &name, `SELECT name FROM brands WHERE id = $1`, id)
	if err != nil {
		return "", err
	}
	return name, nil
}

func (r *TaskRepo) GetCategoryName(ctx context.Context, id uuid.UUID) (string, error) {
	var name string
	err := r.db.GetContext(ctx, &name, `SELECT name FROM task_categories WHERE id = $1`, id)
	if err != nil {
		return "", err
	}
	return name, nil
}

func (r *TaskRepo) GetUserNames(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	names := make(map[uuid.UUID]string)
	if len(ids) == 0 {
		return names, nil
	}
	query, args, err := sqlx.In(`SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id IN (?)`, ids)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)
	var rows []struct {
		ID   uuid.UUID `db:"id"`
		Name string    `db:"name"`
	}
	err = r.db.SelectContext(ctx, &rows, query, args...)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		names[row.ID] = row.Name
	}
	return names, nil
}

func (r *TaskRepo) UpdateStarStatus(ctx context.Context, id uuid.UUID, isStarred bool) error {
	_, err := r.db.ExecContext(ctx, "UPDATE tasks SET is_starred = $1 WHERE id = $2", isStarred, id)
	return err
}
