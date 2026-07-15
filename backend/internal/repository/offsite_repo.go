package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// OffsiteRepo จัดการ SQL queries สำหรับตาราง offsite_requests (คำขอออกหน้างาน)
type OffsiteRepo struct {
	db *sqlx.DB
}

func NewOffsiteRepo(db *sqlx.DB) *OffsiteRepo {
	return &OffsiteRepo{db: db}
}

// Create สร้างคำขอออกหน้างานใหม่
func (r *OffsiteRepo) Create(ctx context.Context, req *domain.OffsiteRequest) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO offsite_requests (id, user_id, date, reason, status)
		VALUES (:id, :user_id, :date, :reason, :status)
	`, req)
	return err
}

// ListByUser ดึงคำขอออกหน้างานทั้งหมดของ user
func (r *OffsiteRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.OffsiteRequest, error) {
	var requests []domain.OffsiteRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM offsite_requests WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// ListPending ดึงคำขอที่รออนุมัติ ทุกคน (สำหรับ Admin)
func (r *OffsiteRepo) ListPending(ctx context.Context) ([]domain.OffsiteRequest, error) {
	var requests []domain.OffsiteRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM offsite_requests WHERE status = 'pending' ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// ListAll ดึงคำขอออกหน้างานทั้งหมดของทุกคน ทุกสถานะ (สำหรับหน้าประวัติย้อนหลัง)
func (r *OffsiteRepo) ListAll(ctx context.Context) ([]domain.OffsiteRequest, error) {
	var requests []domain.OffsiteRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM offsite_requests ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// ListByMonthAllUsers ดึงคำขอออกหน้างานของทุกคนในเดือน (Admin)
func (r *OffsiteRepo) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.OffsiteRequest, error) {
	var requests []domain.OffsiteRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM offsite_requests 
		WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
		ORDER BY date DESC
	`, year, month)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// UpdateStatus อัปเดตสถานะคำขอ (pending → approved/rejected)
func (r *OffsiteRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reviewedBy uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE offsite_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3
	`, status, reviewedBy, id)
	return err
}

// HasApprovedForDate ตรวจสอบว่า user มีคำขอออกหน้างานที่ได้รับอนุมัติสำหรับวันที่ระบุหรือไม่
// ใช้ตอนเช็คอิน → ถ้ามี จะข้ามการตรวจ Geofence (ADR 0005: Trust-Based Offsite)
func (r *OffsiteRepo) HasApprovedForDate(ctx context.Context, userID uuid.UUID, date time.Time) (bool, error) {
	var count int
	err := r.db.GetContext(ctx, &count, `
		SELECT COUNT(*) FROM offsite_requests 
		WHERE user_id = $1 AND date = $2 AND status = 'approved'
	`, userID, date.Format("2006-01-02"))
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// GetByID ดึงคำขอออกหน้างานตาม ID
func (r *OffsiteRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.OffsiteRequest, error) {
	var req domain.OffsiteRequest
	err := r.db.GetContext(ctx, &req, "SELECT * FROM offsite_requests WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

// Update แก้ไขคำขอออกหน้างาน
func (r *OffsiteRepo) Update(ctx context.Context, req *domain.OffsiteRequest) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE offsite_requests 
		SET date = :date, reason = :reason
		WHERE id = :id AND user_id = :user_id AND status = 'pending'
	`, req)
	return err
}

// Delete ลบคำขอออกหน้างาน
func (r *OffsiteRepo) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM offsite_requests WHERE id = $1 AND user_id = $2 AND status = 'pending'
	`, id, userID)
	return err
}
