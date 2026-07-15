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

// ListByMonthAllUsers ดึงใบลาทั้งหมดของทุกคนในเดือนที่ระบุ
func (r *LeaveRepo) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.LeaveRequest, error) {
	var requests []domain.LeaveRequest
	err := r.db.SelectContext(ctx, &requests, `
		SELECT * FROM leave_requests 
		WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
		ORDER BY date DESC
	`, year, month)
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

// LeaveUsageStat represents the sum of used leave days for a specific leave type
type LeaveUsageStat struct {
	LeaveType string  `db:"leave_type"`
	TotalDays float64 `db:"total_days"`
}

// GetLeaveUsageStats calculates the total approved leave days for a user in a specific year, grouped by leave type
func (r *LeaveRepo) GetLeaveUsageStats(ctx context.Context, userID uuid.UUID, year int) ([]LeaveUsageStat, error) {
	var stats []LeaveUsageStat
	// duration is text: "เต็มวัน", "ครึ่งวันเช้า", "ครึ่งวันบ่าย"
	// We need to conditionally sum them.
	// We can sum them in SQL using a CASE statement.
	err := r.db.SelectContext(ctx, &stats, `
		WITH combined_leaves AS (
			-- 1. จากใบลาที่ได้รับการอนุมัติ
			SELECT 
				leave_type,
				CASE 
					WHEN duration = 'เต็มวัน' THEN 1.0
					WHEN duration = 'ครึ่งวันเช้า' THEN 0.5
					WHEN duration = 'ครึ่งวันบ่าย' THEN 0.5
					ELSE 0.0
				END as days
			FROM leave_requests 
			WHERE user_id = $1 
			  AND EXTRACT(YEAR FROM date) = $2 
			  AND status = 'approved'

			UNION ALL

			-- 2. จากประวัติบันทึกการเข้างานด้วยมือที่เป็นการลา
			SELECT 
				CASE 
					WHEN status IN ('sick_leave_full', 'sick_leave_morning', 'sick_leave_afternoon') THEN 'ลาป่วย'
					WHEN status IN ('personal_leave_full', 'personal_leave_morning', 'personal_leave_afternoon') THEN 'ลากิจ'
					WHEN status = 'annual_leave' THEN 'ลาพักร้อน'
					ELSE ''
				END as leave_type,
				CASE 
					WHEN status IN ('sick_leave_full', 'personal_leave_full', 'annual_leave') THEN 1.0
					WHEN status IN ('sick_leave_morning', 'sick_leave_afternoon', 'personal_leave_morning', 'personal_leave_afternoon') THEN 0.5
					ELSE 0.0
				END as days
			FROM attendance
			WHERE user_id = $1
			  AND EXTRACT(YEAR FROM date) = $2
			  -- ตรวจสอบเฉพาะที่เป็นสถานะการลา
			  AND status IN (
				  'sick_leave_full', 'sick_leave_morning', 'sick_leave_afternoon',
				  'personal_leave_full', 'personal_leave_morning', 'personal_leave_afternoon',
				  'annual_leave'
			  )
			  -- หลีกเลี่ยงการนับซ้ำ: หากในวันนั้นมีใบลาที่อนุมัติแล้ว จะไม่เอาจาก attendance
			  AND date NOT IN (
				  SELECT date FROM leave_requests 
				  WHERE user_id = $1 
					AND EXTRACT(YEAR FROM date) = $2 
					AND status = 'approved'
			  )
		)
		SELECT 
			leave_type,
			SUM(days) as total_days
		FROM combined_leaves
		WHERE leave_type != ''
		GROUP BY leave_type
	`, userID, year)
	if err != nil {
		return nil, err
	}
	return stats, nil
}

// GetByID ดึงใบลาตาม ID
func (r *LeaveRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.LeaveRequest, error) {
	var req domain.LeaveRequest
	err := r.db.GetContext(ctx, &req, "SELECT * FROM leave_requests WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return &req, nil
}

// Update แก้ไขใบลา
func (r *LeaveRepo) Update(ctx context.Context, req *domain.LeaveRequest) error {
	_, err := r.db.NamedExecContext(ctx, `
		UPDATE leave_requests 
		SET date = :date, leave_type = :leave_type, duration = :duration, swap_date = :swap_date, reason = :reason, medical_cert_url = :medical_cert_url
		WHERE id = :id AND user_id = :user_id AND status = 'pending'
	`, req)
	return err
}

// Delete ลบใบลา
func (r *LeaveRepo) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		DELETE FROM leave_requests WHERE id = $1 AND user_id = $2 AND status = 'pending'
	`, id, userID)
	return err
}
