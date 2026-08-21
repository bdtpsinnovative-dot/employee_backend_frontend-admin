package repository

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

// ─────────────────────────── Brand ───────────────────────────

// BrandRepo จัดการ SQL queries สำหรับตาราง brands
type BrandRepo struct {
	db *sqlx.DB
}

var (
	ErrBrandNotFound                   = errors.New("brand not found")
	ErrInvalidBrandResponsibilityUsers = errors.New("brand responsibility users must be active")
	ErrInvalidBrandResponsibilityType  = errors.New("brand responsibility type must be bd, mkt, or graphic")
)

func NewBrandRepo(db *sqlx.DB) *BrandRepo {
	return &BrandRepo{db: db}
}

// ListAll ดึง Brand ทั้งหมด เรียงตามชื่อ
func (r *BrandRepo) ListAll(ctx context.Context) ([]domain.Brand, error) {
	var brands []domain.Brand
	err := r.db.SelectContext(ctx, &brands, `SELECT id, name, sort_order, created_at FROM brands ORDER BY sort_order ASC, name ASC`)
	if err != nil {
		return nil, err
	}
	if len(brands) == 0 {
		return brands, nil
	}

	var responsibilities []struct {
		BrandID            uuid.UUID `db:"brand_id"`
		UserID             uuid.UUID `db:"user_id"`
		ResponsibilityType string    `db:"responsibility_type"`
	}
	if err := r.db.SelectContext(ctx, &responsibilities, `
		SELECT br.brand_id, br.user_id, br.responsibility_type
		FROM brand_responsibilities br
		JOIN users u ON u.id = br.user_id
		WHERE u.status = 'active'
		ORDER BY br.responsibility_type ASC, br.created_at ASC, br.user_id ASC
	`); err != nil {
		return nil, err
	}

	brandIndex := make(map[uuid.UUID]int, len(brands))
	for i := range brands {
		brands[i].ResponsibleUserIDs = []uuid.UUID{}
		brands[i].Responsibilities = []domain.BrandResponsibility{}
		brandIndex[brands[i].ID] = i
	}
	for _, responsibility := range responsibilities {
		if i, ok := brandIndex[responsibility.BrandID]; ok {
			brands[i].ResponsibleUserIDs = append(
				brands[i].ResponsibleUserIDs,
				responsibility.UserID,
			)
			brands[i].Responsibilities = append(
				brands[i].Responsibilities,
				domain.BrandResponsibility{
					UserID:             responsibility.UserID,
					ResponsibilityType: responsibility.ResponsibilityType,
				},
			)
		}
	}
	return brands, nil
}

// Create เพิ่ม Brand ใหม่
func (r *BrandRepo) Create(ctx context.Context, b *domain.Brand) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO brands (id, name, sort_order, created_at)
		VALUES (:id, :name, COALESCE((SELECT MAX(sort_order) + 1 FROM brands), 0), :created_at)
	`, b)
	return err
}

func (r *BrandRepo) Reorder(ctx context.Context, brandIDs []uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var count int
	if err := tx.GetContext(ctx, &count, `SELECT COUNT(*) FROM brands`); err != nil {
		return err
	}
	if count != len(brandIDs) {
		return errors.New("brand order must include every brand")
	}
	for index, brandID := range brandIDs {
		if _, err := tx.ExecContext(ctx, `UPDATE brands SET sort_order = $1 WHERE id = $2`, index, brandID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Delete ลบ Brand
func (r *BrandRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM brands WHERE id = $1`, id)
	return err
}

// ReplaceResponsibilities atomically replaces a brand's responsible users.
// Only active users may be mapped.
func (r *BrandRepo) ReplaceResponsibilities(
	ctx context.Context,
	brandID uuid.UUID,
	responsibilities []domain.BrandResponsibility,
) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var brandExists bool
	if err := tx.GetContext(
		ctx,
		&brandExists,
		`SELECT EXISTS(SELECT 1 FROM brands WHERE id = $1)`,
		brandID,
	); err != nil {
		return err
	}
	if !brandExists {
		return ErrBrandNotFound
	}

	idValues := make([]string, 0, len(responsibilities))
	seenUserIDs := make(map[uuid.UUID]struct{}, len(responsibilities))
	for _, responsibility := range responsibilities {
		switch responsibility.ResponsibilityType {
		case "bd", "mkt", "graphic":
		default:
			return ErrInvalidBrandResponsibilityType
		}
		if _, exists := seenUserIDs[responsibility.UserID]; exists {
			continue
		}
		seenUserIDs[responsibility.UserID] = struct{}{}
		idValues = append(idValues, responsibility.UserID.String())
	}
	if len(idValues) > 0 {
		var activeCount int
		if err := tx.GetContext(ctx, &activeCount, `
			SELECT COUNT(*)
			FROM users
			WHERE id = ANY($1::uuid[]) AND status = 'active'
		`, pq.Array(idValues)); err != nil {
			return err
		}
		if activeCount != len(idValues) {
			return ErrInvalidBrandResponsibilityUsers
		}
	}

	if _, err := tx.ExecContext(
		ctx,
		`DELETE FROM brand_responsibilities WHERE brand_id = $1`,
		brandID,
	); err != nil {
		return err
	}
	for _, responsibility := range responsibilities {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO brand_responsibilities (brand_id, user_id, responsibility_type)
			VALUES ($1, $2, $3)
			ON CONFLICT (brand_id, user_id)
			DO UPDATE SET responsibility_type = EXCLUDED.responsibility_type
		`, brandID, responsibility.UserID, responsibility.ResponsibilityType); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// ─────────────────────────── TaskCategory ───────────────────────────

// TaskCategoryRepo จัดการ SQL queries สำหรับตาราง task_categories
type TaskCategoryRepo struct {
	db *sqlx.DB
}

func NewTaskCategoryRepo(db *sqlx.DB) *TaskCategoryRepo {
	return &TaskCategoryRepo{db: db}
}

// ListAll ดึงหมวดหมู่งานทั้งหมด เรียงตามชื่อ
func (r *TaskCategoryRepo) ListAll(ctx context.Context) ([]domain.TaskCategory, error) {
	var categories []domain.TaskCategory
	err := r.db.SelectContext(ctx, &categories, `SELECT * FROM task_categories ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	return categories, nil
}

// Create เพิ่มหมวดหมู่งานใหม่
func (r *TaskCategoryRepo) Create(ctx context.Context, c *domain.TaskCategory) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_categories (id, name, created_at)
		VALUES (:id, :name, :created_at)
	`, c)
	return err
}

// Delete ลบหมวดหมู่งาน
func (r *TaskCategoryRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_categories WHERE id = $1`, id)
	return err
}

// ─────────────────────────── TaskSubItem ───────────────────────────

// TaskSubItemRepo จัดการ SQL queries สำหรับตาราง task_sub_items
type TaskSubItemRepo struct {
	db *sqlx.DB
}

func NewTaskSubItemRepo(db *sqlx.DB) *TaskSubItemRepo {
	return &TaskSubItemRepo{db: db}
}

// ListByTask ดึง sub-items ทั้งหมดของ task
func (r *TaskSubItemRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.TaskSubItem, error) {
	var items []domain.TaskSubItem
	err := r.db.SelectContext(ctx, &items, `
		SELECT * FROM task_sub_items WHERE task_id = $1 ORDER BY sort_order ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	return items, nil
}

// CreateBatch เพิ่ม sub-items หลายรายการพร้อมกัน
func (r *TaskSubItemRepo) CreateBatch(ctx context.Context, items []domain.TaskSubItem) error {
	for _, item := range items {
		if item.Status == "" {
			item.Status = "pending"
		}
		_, err := r.db.NamedExecContext(ctx, `
			INSERT INTO task_sub_items (id, task_id, title, is_done, status, sort_order, created_at)
			VALUES (:id, :task_id, :title, :is_done, :status, :sort_order, :created_at)
		`, item)
		if err != nil {
			return err
		}
	}
	return nil
}

// DeleteByTask ลบ sub-items ทั้งหมดของ task
func (r *TaskSubItemRepo) DeleteByTask(ctx context.Context, taskID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_sub_items WHERE task_id = $1`, taskID)
	return err
}

// UpdateSubItemStatus อัปเดตสถานะของ sub-item (pending, in_progress, completed)
func (r *TaskSubItemRepo) UpdateSubItemStatus(ctx context.Context, id uuid.UUID, status string) error {
	isDone := status == "completed"
	_, err := r.db.ExecContext(ctx, `UPDATE task_sub_items SET status = $1, is_done = $2 WHERE id = $3`, status, isDone, id)
	return err
}

// ListByCard ดึง sub-items ทั้งหมดของการ์ด (พร้อมประวัติการตรวจสอบ)
func (r *TaskSubItemRepo) ListByCard(ctx context.Context, cardID uuid.UUID) ([]domain.TaskSubItem, error) {
	var items []domain.TaskSubItem
	err := r.db.SelectContext(ctx, &items, `
		SELECT * FROM task_sub_items WHERE card_id = $1 ORDER BY sort_order ASC, created_at ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return items, nil
	}

	subItemIDs := make([]uuid.UUID, len(items))
	itemMap := make(map[uuid.UUID]*domain.TaskSubItem, len(items))
	for i := range items {
		items[i].Verifications = []domain.SubItemVerification{}
		subItemIDs[i] = items[i].ID
		itemMap[items[i].ID] = &items[i]
	}

	query, args, err := sqlx.In(`
		SELECT * FROM sub_item_verifications 
		WHERE sub_item_id IN (?) 
		ORDER BY round DESC, created_at DESC
	`, subItemIDs)
	if err == nil {
		query = r.db.Rebind(query)
		var allVerifications []domain.SubItemVerification
		if err := r.db.SelectContext(ctx, &allVerifications, query, args...); err == nil {
			for _, v := range allVerifications {
				if item, ok := itemMap[v.SubItemID]; ok {
					item.Verifications = append(item.Verifications, v)
				}
			}
		}
	}

	return items, nil
}

// ListByCards returns sub-items for all requested cards without issuing one
// query per card. Verification history is loaded in one additional query.
func (r *TaskSubItemRepo) ListByCards(ctx context.Context, cardIDs []uuid.UUID) (map[uuid.UUID][]domain.TaskSubItem, error) {
	result := make(map[uuid.UUID][]domain.TaskSubItem, len(cardIDs))
	for _, cardID := range cardIDs {
		result[cardID] = nil
	}
	if len(cardIDs) == 0 {
		return result, nil
	}

	query, args, err := sqlx.In(`
		SELECT *
		FROM task_sub_items
		WHERE card_id IN (?)
		ORDER BY card_id, sort_order ASC, created_at ASC
	`, cardIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	var items []domain.TaskSubItem
	if err := r.db.SelectContext(ctx, &items, query, args...); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return result, nil
	}

	subItemIDs := make([]uuid.UUID, len(items))
	itemIndexes := make(map[uuid.UUID]int, len(items))
	for i := range items {
		items[i].Verifications = []domain.SubItemVerification{}
		subItemIDs[i] = items[i].ID
		itemIndexes[items[i].ID] = i
	}

	verificationQuery, verificationArgs, err := sqlx.In(`
		SELECT *
		FROM sub_item_verifications
		WHERE sub_item_id IN (?)
		ORDER BY sub_item_id, round DESC, created_at DESC
	`, subItemIDs)
	if err != nil {
		return nil, err
	}
	verificationQuery = r.db.Rebind(verificationQuery)
	var verifications []domain.SubItemVerification
	if err := r.db.SelectContext(ctx, &verifications, verificationQuery, verificationArgs...); err != nil {
		return nil, err
	}
	for _, verification := range verifications {
		if index, ok := itemIndexes[verification.SubItemID]; ok {
			items[index].Verifications = append(items[index].Verifications, verification)
		}
	}
	for _, item := range items {
		if item.CardID != nil {
			result[*item.CardID] = append(result[*item.CardID], item)
		}
	}
	return result, nil
}

func (r *TaskSubItemRepo) LinkSubItemsToCard(ctx context.Context, cardID uuid.UUID, taskID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE task_sub_items SET card_id = $1 WHERE task_id = $2 AND card_id IS NULL
	`, cardID, taskID)
	return err
}

func (r *TaskSubItemRepo) Create(ctx context.Context, item *domain.TaskSubItem) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_sub_items (id, task_id, card_id, title, is_done, status, sort_order, created_at)
		VALUES (:id, :task_id, :card_id, :title, :is_done, :status, :sort_order, :created_at)
	`, item)
	return err
}

func (r *TaskSubItemRepo) UpdateSubItemDetail(ctx context.Context, id uuid.UUID, title string, startDate, dueDate *time.Time, linkURL, attachmentURL, verificationNotes, adminComment *string) error {
	if adminComment != nil {
		_, err := r.db.ExecContext(ctx, `
			UPDATE task_sub_items 
			SET title = $1, start_date = $2, due_date = $3, link_url = $4, attachment_url = $5, verification_notes = $6, admin_comment = $7
			WHERE id = $8
		`, title, startDate, dueDate, linkURL, attachmentURL, verificationNotes, *adminComment, id)
		return err
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE task_sub_items 
		SET title = $1, start_date = $2, due_date = $3, link_url = $4, attachment_url = $5, verification_notes = $6
		WHERE id = $7
	`, title, startDate, dueDate, linkURL, attachmentURL, verificationNotes, id)
	return err
}

func (r *TaskSubItemRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_sub_items WHERE id = $1`, id)
	return err
}

func (r *TaskSubItemRepo) ListVerifications(ctx context.Context, subItemID uuid.UUID) ([]domain.SubItemVerification, error) {
	var verifications []domain.SubItemVerification
	err := r.db.SelectContext(ctx, &verifications, `
		SELECT * FROM sub_item_verifications WHERE sub_item_id = $1 ORDER BY round DESC, created_at DESC
	`, subItemID)
	if err != nil {
		return nil, err
	}
	return verifications, nil
}

func (r *TaskSubItemRepo) GetMaxRound(ctx context.Context, subItemID uuid.UUID) (int, error) {
	var maxRound int
	err := r.db.GetContext(ctx, &maxRound, `
		SELECT COALESCE(MAX(round), 0) FROM sub_item_verifications WHERE sub_item_id = $1
	`, subItemID)
	return maxRound, err
}

func (r *TaskSubItemRepo) CreateVerification(ctx context.Context, v *domain.SubItemVerification) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO sub_item_verifications (id, sub_item_id, verified_by, verifier_name, round, status, notes, created_at)
		VALUES (:id, :sub_item_id, :verified_by, :verifier_name, :round, :status, :notes, :created_at)
	`, v)
	return err
}

func (r *TaskSubItemRepo) UpdateSubItemVerificationNotes(ctx context.Context, id uuid.UUID, notes string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_sub_items SET verification_notes = $1 WHERE id = $2`, notes, id)
	return err
}

// ─────────────────────────── TaskList & TaskCard Repos ───────────────────────────

type TaskListRepo struct {
	db *sqlx.DB
}

// jsonbTextValue keeps lib/pq from treating JSON text as PostgreSQL's binary
// jsonb representation. Passing json.RawMessage directly is encoded as []byte
// and makes PostgreSQL interpret the first byte ('[' is 91) as a jsonb version.
func jsonbTextValue(value *json.RawMessage) any {
	if value == nil {
		return nil
	}
	return string(*value)
}

func NewTaskListRepo(db *sqlx.DB) *TaskListRepo {
	return &TaskListRepo{db: db}
}

func (r *TaskListRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.TaskList, error) {
	type listRow struct {
		domain.TaskList
		AssigneeID        *uuid.UUID `db:"assignee_id"`
		AssigneeFirstName *string    `db:"assignee_first_name"`
		AssigneeLastName  *string    `db:"assignee_last_name"`
		AssigneeNickname  *string    `db:"assignee_nickname"`
		AssigneeAvatarURL *string    `db:"assignee_avatar_url"`
		AssigneePosition  string     `db:"assignee_position"`
	}
	var rows []listRow
	if err := r.db.SelectContext(ctx, &rows, `
		SELECT tl.id, tl.task_id, tl.name, tl.description, tl.sort_order, tl.created_at,
		       tl.start_date, tl.due_date, tl.priority, tl.status, tl.admin_comment,
		       tl.attachments, tl.deleted_at,
		       u.id AS assignee_id,
		       u.first_name AS assignee_first_name,
		       u.last_name AS assignee_last_name,
		       u.nickname AS assignee_nickname,
		       u.avatar_url AS assignee_avatar_url,
		       COALESCE(p.name, '') AS assignee_position
		FROM task_lists tl
		LEFT JOIN list_assignees la ON la.list_id = tl.id
		LEFT JOIN users u ON u.id = la.user_id
		LEFT JOIN positions p ON p.id = u.position_id
		WHERE tl.task_id = $1 AND tl.deleted_at IS NULL
		ORDER BY tl.sort_order ASC, tl.created_at ASC, u.first_name, u.last_name
	`, taskID); err != nil {
		return nil, err
	}

	var lists []domain.TaskList
	indexes := make(map[uuid.UUID]int, len(rows))
	for _, row := range rows {
		index, exists := indexes[row.ID]
		if !exists {
			list := row.TaskList
			list.AssigneeIDs = []uuid.UUID{}
			list.Assignees = []domain.UserSummary{}
			lists = append(lists, list)
			index = len(lists) - 1
			indexes[row.ID] = index
		}
		if row.AssigneeID == nil {
			continue
		}
		firstName, lastName := "", ""
		if row.AssigneeFirstName != nil {
			firstName = *row.AssigneeFirstName
		}
		if row.AssigneeLastName != nil {
			lastName = *row.AssigneeLastName
		}
		lists[index].AssigneeIDs = append(lists[index].AssigneeIDs, *row.AssigneeID)
		lists[index].Assignees = append(lists[index].Assignees, domain.UserSummary{
			ID:        *row.AssigneeID,
			FirstName: firstName,
			LastName:  lastName,
			Nickname:  row.AssigneeNickname,
			AvatarURL: row.AssigneeAvatarURL,
			Position:  row.AssigneePosition,
		})
	}
	return lists, nil
}

func (r *TaskListRepo) ListAllPending(ctx context.Context, userID uuid.UUID) ([]domain.TaskList, error) {
	var lists []domain.TaskList
	err := r.db.SelectContext(ctx, &lists, `
		SELECT tl.id, tl.task_id, tl.name, tl.description, tl.sort_order, tl.created_at,
		       tl.start_date, tl.due_date, tl.priority, tl.status, tl.admin_comment,
		       tl.attachments, tl.deleted_at
		FROM task_lists tl
		INNER JOIN tasks t ON t.id = tl.task_id
		WHERE tl.status != 'completed'
		  AND tl.deleted_at IS NULL
		  AND t.deleted_at IS NULL
		  AND (
			t.assigned_by = $1
			OR t.assigned_to = $1
			OR EXISTS (
				SELECT 1
				FROM task_assignees ta
				WHERE ta.task_id = t.id AND ta.user_id = $1
			)
			OR EXISTS (
				SELECT 1
				FROM list_assignees la_access
				WHERE la_access.list_id = tl.id AND la_access.user_id = $1
			)
		  )
		ORDER BY tl.due_date ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	if len(lists) > 0 {
		var listAssignees []struct {
			ListID    uuid.UUID `db:"list_id"`
			UserID    uuid.UUID `db:"user_id"`
			FirstName string    `db:"first_name"`
			LastName  string    `db:"last_name"`
			Nickname  *string   `db:"nickname"`
			AvatarURL *string   `db:"avatar_url"`
			Position  string    `db:"position"`
		}
		listIDs := make([]uuid.UUID, len(lists))
		for i, list := range lists {
			listIDs[i] = list.ID
		}
		query, args, queryErr := sqlx.In(`
			SELECT la.list_id, u.id AS user_id, u.first_name, u.last_name,
			       u.nickname, u.avatar_url, COALESCE(p.name, '') AS position
			FROM list_assignees la
			JOIN users u ON u.id = la.user_id
			LEFT JOIN positions p ON p.id = u.position_id
			WHERE la.list_id IN (?)
			ORDER BY la.list_id, u.first_name, u.last_name
		`, listIDs)
		if queryErr == nil {
			query = r.db.Rebind(query)
			err = r.db.SelectContext(ctx, &listAssignees, query, args...)
		} else {
			err = queryErr
		}
		if err == nil {
			listMap := make(map[uuid.UUID][]uuid.UUID)
			assigneeMap := make(map[uuid.UUID][]domain.UserSummary)
			for _, la := range listAssignees {
				listMap[la.ListID] = append(listMap[la.ListID], la.UserID)
				assigneeMap[la.ListID] = append(assigneeMap[la.ListID], domain.UserSummary{
					ID:        la.UserID,
					FirstName: la.FirstName,
					LastName:  la.LastName,
					Nickname:  la.Nickname,
					AvatarURL: la.AvatarURL,
					Position:  la.Position,
				})
			}
			for i, l := range lists {
				ids := listMap[l.ID]
				if ids == nil {
					ids = []uuid.UUID{}
				}
				lists[i].AssigneeIDs = ids
				assignees := assigneeMap[l.ID]
				if assignees == nil {
					assignees = []domain.UserSummary{}
				}
				lists[i].Assignees = assignees
			}
		}
	}
	return lists, nil
}

func (r *TaskListRepo) Get(ctx context.Context, id uuid.UUID) (*domain.TaskList, error) {
	var list domain.TaskList
	err := r.db.GetContext(ctx, &list, `
		SELECT id, task_id, name, description, sort_order, created_at,
		       start_date, due_date, priority, status, admin_comment, attachments
		FROM task_lists
		WHERE id = $1
	`, id)
	if err != nil {
		return nil, err
	}
	var assigneeIDs []uuid.UUID
	if err := r.db.SelectContext(ctx, &assigneeIDs, `
		SELECT user_id FROM list_assignees WHERE list_id = $1 ORDER BY user_id
	`, id); err != nil {
		return nil, err
	}
	list.AssigneeIDs = assigneeIDs
	return &list, nil
}

func (r *TaskListRepo) Create(ctx context.Context, list *domain.TaskList) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO task_lists (id, task_id, name, description, sort_order, start_date, due_date, priority, status, admin_comment, attachments, created_at)
		VALUES (:id, :task_id, :name, :description, :sort_order, :start_date, :due_date, :priority, :status, :admin_comment, :attachments, :created_at)
	`, map[string]any{
		"id":            list.ID,
		"task_id":       list.TaskID,
		"name":          list.Name,
		"description":   list.Description,
		"sort_order":    list.SortOrder,
		"start_date":    list.StartDate,
		"due_date":      list.DueDate,
		"priority":      list.Priority,
		"status":        list.Status,
		"admin_comment": list.AdminComment,
		"attachments":   jsonbTextValue(&list.Attachments),
		"created_at":    list.CreatedAt,
	})
	if err != nil {
		return err
	}

	for _, userID := range list.AssigneeIDs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO list_assignees (list_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, list.ID, userID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// SyncParentTaskStatus derives the parent task status from its active
// deliverables. A task with no deliverables remains pending; a partially
// completed task is in progress; and a task whose deliverables are all
// complete waits for review.
func (r *TaskListRepo) SyncParentTaskStatus(ctx context.Context, taskID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks AS t
		SET status = CASE
			WHEN stats.total_count = 0 THEN 'pending'
			WHEN stats.done_count = stats.total_count THEN 'in_review'
			ELSE 'in_progress'
		END,
		completed_at = NULL
		FROM (
			SELECT
				$1::uuid AS task_id,
				COUNT(*)::int AS total_count,
				COUNT(*) FILTER (WHERE status = 'completed')::int AS done_count
			FROM task_lists
			WHERE task_id = $1 AND deleted_at IS NULL
		) AS stats
		WHERE t.id = stats.task_id
	`, taskID)
	return err
}

// SyncParentTaskDueDate keeps the parent task date aligned with the latest
// active sub-task date. If no sub-task has a date, retain the existing parent
// date so creating an undated sub-task does not erase a manually set deadline.
func (r *TaskListRepo) SyncParentTaskDueDate(ctx context.Context, taskID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE tasks AS t
		SET due_date = COALESCE((
			SELECT MAX(tl.due_date)
			FROM task_lists tl
			WHERE tl.task_id = t.id
			  AND tl.deleted_at IS NULL
		), t.due_date)
		WHERE t.id = $1
	`, taskID)
	return err
}

func (r *TaskListRepo) Delete(ctx context.Context, id uuid.UUID) error {
	// Deliverables are soft-deleted so legacy cards and sub-items remain
	// recoverable if this hidden hierarchy is restored in the future.
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE task_lists SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL`,
		id,
	)
	return err
}

func (r *TaskListRepo) ListTrashByTask(ctx context.Context, taskID uuid.UUID) ([]domain.TaskList, error) {
	var lists []domain.TaskList
	err := r.db.SelectContext(ctx, &lists, `
		SELECT * FROM task_lists WHERE task_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC
	`, taskID)
	if err != nil {
		return nil, err
	}
	if len(lists) > 0 {
		var listAssignees []struct {
			ListID uuid.UUID `db:"list_id"`
			UserID uuid.UUID `db:"user_id"`
		}
		err = r.db.SelectContext(ctx, &listAssignees, `SELECT list_id, user_id FROM list_assignees`)
		if err == nil {
			listMap := make(map[uuid.UUID][]uuid.UUID)
			for _, la := range listAssignees {
				listMap[la.ListID] = append(listMap[la.ListID], la.UserID)
			}
			for i, l := range lists {
				ids := listMap[l.ID]
				if ids == nil {
					ids = []uuid.UUID{}
				}
				lists[i].AssigneeIDs = ids
			}
		}
	}
	return lists, nil
}

func (r *TaskListRepo) Restore(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_lists SET deleted_at = NULL WHERE id = $1`, id)
	return err
}

func (r *TaskListRepo) UpdateSortOrder(ctx context.Context, id uuid.UUID, sortOrder int) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_lists SET sort_order = $1 WHERE id = $2`, sortOrder, id)
	return err
}

func (r *TaskListRepo) UpdateName(ctx context.Context, id uuid.UUID, name string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_lists SET name = $1 WHERE id = $2`, name, id)
	return err
}

func (r *TaskListRepo) UpdateDetail(
	ctx context.Context,
	id uuid.UUID,
	name, description, priority, status, adminComment *string,
	startDate, dueDate *time.Time,
	attachments *json.RawMessage,
	assigneeIDs *[]uuid.UUID,
) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `
		UPDATE task_lists 
		SET name = COALESCE($1, name),
		    description = COALESCE($2, description),
		    start_date = COALESCE($3, start_date),
		    due_date = COALESCE($4, due_date),
		    priority = COALESCE($5, priority),
		    status = COALESCE($6, status),
		    admin_comment = COALESCE($7, admin_comment),
		    attachments = COALESCE($8, attachments)
		WHERE id = $9
	`, name, description, startDate, dueDate, priority, status, adminComment,
		jsonbTextValue(attachments), id)
	if err != nil {
		return err
	}

	if assigneeIDs != nil {
		if _, err = tx.ExecContext(ctx, `DELETE FROM list_assignees WHERE list_id = $1`, id); err != nil {
			return err
		}
		for _, userID := range *assigneeIDs {
			if _, err = tx.ExecContext(ctx, `
				INSERT INTO list_assignees (list_id, user_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
			`, id, userID); err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

type TaskCardRepo struct {
	db *sqlx.DB
}

func NewTaskCardRepo(db *sqlx.DB) *TaskCardRepo {
	return &TaskCardRepo{db: db}
}

// GetDB exposes the underlying DB for advanced queries in handlers.
func (r *TaskCardRepo) GetDB() *sqlx.DB { return r.db }

func (r *TaskCardRepo) ListByList(ctx context.Context, listID uuid.UUID) ([]domain.TaskCard, error) {
	var cards []domain.TaskCard
	err := r.db.SelectContext(ctx, &cards, `
		SELECT id, list_id, title, description, status, sort_order, created_at,
		       start_date, due_date, priority, admin_comment
		FROM task_cards
		WHERE list_id = $1
		ORDER BY sort_order ASC, created_at ASC
	`, listID)
	if err != nil {
		return nil, err
	}
	if len(cards) > 0 {
		var cardAssignees []struct {
			CardID uuid.UUID `db:"card_id"`
			UserID uuid.UUID `db:"user_id"`
		}
		err = r.db.SelectContext(ctx, &cardAssignees, `SELECT card_id, user_id FROM card_assignees`)
		if err == nil {
			cardMap := make(map[uuid.UUID][]uuid.UUID)
			for _, ca := range cardAssignees {
				cardMap[ca.CardID] = append(cardMap[ca.CardID], ca.UserID)
			}
			for i, c := range cards {
				ids := cardMap[c.ID]
				if ids == nil {
					ids = []uuid.UUID{}
				}
				cards[i].AssigneeIDs = ids
			}
		}
	}
	return cards, nil
}

// ListByLists returns cards grouped by list in a single query. Assignee
// details are deliberately loaded by CardAssigneeRepo.ListByCards so the
// board endpoint does not scan card_assignees once for every list.
func (r *TaskCardRepo) ListByLists(ctx context.Context, listIDs []uuid.UUID) (map[uuid.UUID][]domain.TaskCard, error) {
	result := make(map[uuid.UUID][]domain.TaskCard, len(listIDs))
	for _, listID := range listIDs {
		result[listID] = nil
	}
	if len(listIDs) == 0 {
		return result, nil
	}

	query, args, err := sqlx.In(`
		SELECT id, list_id, title, description, status, sort_order, created_at,
		       start_date, due_date, priority, admin_comment
		FROM task_cards
		WHERE list_id IN (?)
		ORDER BY list_id, sort_order ASC, created_at ASC
	`, listIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)

	var cards []domain.TaskCard
	if err := r.db.SelectContext(ctx, &cards, query, args...); err != nil {
		return nil, err
	}
	for _, card := range cards {
		result[card.ListID] = append(result[card.ListID], card)
	}
	return result, nil
}

func (r *TaskCardRepo) Create(ctx context.Context, card *domain.TaskCard) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO task_cards (id, list_id, title, description, status, sort_order, created_at, start_date, due_date, priority)
		VALUES (:id, :list_id, :title, :description, :status, :sort_order, :created_at, :start_date, :due_date, :priority)
	`, card)
	if err != nil {
		return err
	}

	for _, userID := range card.AssigneeIDs {
		_, err = tx.ExecContext(ctx, `
			INSERT INTO card_assignees (card_id, user_id)
			VALUES ($1, $2)
			ON CONFLICT DO NOTHING
		`, card.ID, userID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (r *TaskCardRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_cards WHERE id = $1`, id)
	return err
}

func (r *TaskCardRepo) UpdateCard(ctx context.Context, id uuid.UUID, title, description string, startDate, dueDate *time.Time, adminComment *string, priority string, assigneeIDs *[]uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if adminComment != nil {
		_, err = tx.ExecContext(ctx, `UPDATE task_cards SET title = $1, description = $2, start_date = $3, due_date = $4, admin_comment = $5, priority = $6 WHERE id = $7`, title, description, startDate, dueDate, *adminComment, priority, id)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE task_cards SET title = $1, description = $2, start_date = $3, due_date = $4, priority = $5 WHERE id = $6`, title, description, startDate, dueDate, priority, id)
	}
	if err != nil {
		return err
	}

	if assigneeIDs != nil {
		_, err = tx.ExecContext(ctx, `DELETE FROM card_assignees WHERE card_id = $1`, id)
		if err != nil {
			return err
		}

		for _, userID := range *assigneeIDs {
			_, err = tx.ExecContext(ctx, `
				INSERT INTO card_assignees (card_id, user_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
			`, id, userID)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit()
}

func (r *TaskCardRepo) Update(
	ctx context.Context,
	id uuid.UUID,
	status *string,
	listID *uuid.UUID,
	sortOrder *int,
	title, description *string,
	startDate, dueDate *time.Time,
	adminComment, priority *string,
) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE task_cards
		SET status = COALESCE($1, status),
		    list_id = COALESCE($2, list_id),
		    sort_order = COALESCE($3, sort_order),
		    title = COALESCE($4, title),
		    description = COALESCE($5, description),
		    start_date = COALESCE($6, start_date),
		    due_date = COALESCE($7, due_date),
		    admin_comment = COALESCE($8, admin_comment),
		    priority = COALESCE($9, priority)
		WHERE id = $10
	`, status, listID, sortOrder, title, description, startDate, dueDate, adminComment, priority, id)
	return err
}

func (r *TaskCardRepo) GetTaskID(ctx context.Context, cardID uuid.UUID) (uuid.UUID, error) {
	var taskID uuid.UUID
	err := r.db.GetContext(ctx, &taskID, `
		SELECT l.task_id FROM task_cards c
		JOIN task_lists l ON c.list_id = l.id
		WHERE c.id = $1
	`, cardID)
	return taskID, err
}
func (r *TaskCardRepo) MoveToList(ctx context.Context, cardID, listID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_cards SET list_id = $1 WHERE id = $2`, listID, cardID)
	return err
}

func (r *TaskCardRepo) Get(ctx context.Context, id uuid.UUID) (*domain.TaskCard, error) {
	var card domain.TaskCard
	err := r.db.GetContext(ctx, &card, `
		SELECT id, list_id, title, description, status, sort_order, created_at,
		       start_date, due_date, priority, admin_comment
		FROM task_cards
		WHERE id = $1
	`, id)
	if err != nil {
		return nil, err
	}
	return &card, nil
}
