package repository

import (
	"context"

	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// ─────────────────────────── Brand ───────────────────────────

// BrandRepo จัดการ SQL queries สำหรับตาราง brands
type BrandRepo struct {
	db *sqlx.DB
}

func NewBrandRepo(db *sqlx.DB) *BrandRepo {
	return &BrandRepo{db: db}
}

// ListAll ดึง Brand ทั้งหมด เรียงตามชื่อ
func (r *BrandRepo) ListAll(ctx context.Context) ([]domain.Brand, error) {
	var brands []domain.Brand
	err := r.db.SelectContext(ctx, &brands, `SELECT * FROM brands ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	return brands, nil
}

// Create เพิ่ม Brand ใหม่
func (r *BrandRepo) Create(ctx context.Context, b *domain.Brand) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO brands (id, name, created_at)
		VALUES (:id, :name, :created_at)
	`, b)
	return err
}

// Delete ลบ Brand
func (r *BrandRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM brands WHERE id = $1`, id)
	return err
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
	for i := range items {
		verifications, err := r.ListVerifications(ctx, items[i].ID)
		if err == nil {
			items[i].Verifications = verifications
		} else {
			items[i].Verifications = []domain.SubItemVerification{}
		}
	}
	return items, nil
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

func NewTaskListRepo(db *sqlx.DB) *TaskListRepo {
	return &TaskListRepo{db: db}
}

func (r *TaskListRepo) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.TaskList, error) {
	var lists []domain.TaskList
	err := r.db.SelectContext(ctx, &lists, `
		SELECT * FROM task_lists WHERE task_id = $1 ORDER BY sort_order ASC, created_at ASC
	`, taskID)
	if err != nil {
		return nil, err
	}
	return lists, nil
}

func (r *TaskListRepo) Create(ctx context.Context, list *domain.TaskList) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_lists (id, task_id, name, description, sort_order, start_date, due_date, created_at)
		VALUES (:id, :task_id, :name, :description, :sort_order, :start_date, :due_date, :created_at)
	`, list)
	return err
}

func (r *TaskListRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_lists WHERE id = $1`, id)
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

func (r *TaskListRepo) UpdateDetail(ctx context.Context, id uuid.UUID, name, description string, startDate, dueDate *time.Time) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE task_lists 
		SET name = $1, description = $2, start_date = $3, due_date = $4
		WHERE id = $5
	`, name, description, startDate, dueDate, id)
	return err
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
		SELECT * FROM task_cards WHERE list_id = $1 ORDER BY sort_order ASC, created_at ASC
	`, listID)
	if err != nil {
		return nil, err
	}
	return cards, nil
}

func (r *TaskCardRepo) Create(ctx context.Context, card *domain.TaskCard) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO task_cards (id, list_id, title, description, status, sort_order, created_at, start_date, due_date, priority)
		VALUES (:id, :list_id, :title, :description, :status, :sort_order, :created_at, :start_date, :due_date, :priority)
	`, card)
	return err
}

func (r *TaskCardRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE task_cards SET status = $1 WHERE id = $2`, status, id)
	return err
}

func (r *TaskCardRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM task_cards WHERE id = $1`, id)
	return err
}

func (r *TaskCardRepo) UpdateCard(ctx context.Context, id uuid.UUID, title, description string, startDate, dueDate *time.Time, adminComment *string, priority string) error {
	if adminComment != nil {
		_, err := r.db.ExecContext(ctx, `UPDATE task_cards SET title = $1, description = $2, start_date = $3, due_date = $4, admin_comment = $5, priority = $6 WHERE id = $7`, title, description, startDate, dueDate, *adminComment, priority, id)
		return err
	}
	_, err := r.db.ExecContext(ctx, `UPDATE task_cards SET title = $1, description = $2, start_date = $3, due_date = $4, priority = $5 WHERE id = $6`, title, description, startDate, dueDate, priority, id)
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


