package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// LeaveRepo จัดการ SQL queries สำหรับตาราง leave_requests (ใบลาพนักงาน)
type LeaveRepo struct {
	db *sqlx.DB
}

func NewLeaveRepo(db *sqlx.DB) *LeaveRepo {
	return &LeaveRepo{db: db}
}

// Create สร้างใบลาใหม่ (สถานะ pending รอ Admin อนุมัติ)
func (r *LeaveRepo) Create(ctx context.Context, req *domain.LeaveRequest) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO leave_requests (id, user_id, date, leave_type, duration, swap_date, reason, status, medical_cert_url)
		VALUES (:id, :user_id, :date, :leave_type, :duration, :swap_date, :reason, :status, :medical_cert_url)
	`, req)
	return err
}

// ListByUser ดึงใบลาทั้งหมดของ user (เรียงจากใหม่ไปเก่า)
func (r *LeaveRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.LeaveRequest, error) {
	var requests []domain.LeaveRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM leave_requests WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// ListPending ดึงใบลาที่รออนุมัติ ทุกคน (สำหรับ Admin)
func (r *LeaveRepo) ListPending(ctx context.Context) ([]domain.LeaveRequest, error) {
	var requests []domain.LeaveRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM leave_requests WHERE status = 'pending' ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// ListAll ดึงใบลาทั้งหมดของทุกคน ทุกสถานะ (สำหรับหน้าประวัติย้อนหลัง)
func (r *LeaveRepo) ListAll(ctx context.Context) ([]domain.LeaveRequest, error) {
	var requests []domain.LeaveRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM leave_requests ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	return requests, nil
}

// UpdateStatus อัปเดตสถานะใบลา (pending → approved/rejected)
func (r *LeaveRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reviewedBy uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE leave_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3
	`, status, reviewedBy, id)
	return err
}
