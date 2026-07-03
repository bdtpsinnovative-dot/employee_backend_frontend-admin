package repository

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// AttendanceRepo จัดการ SQL queries สำหรับตาราง attendance (บันทึกลงเวลา)
type AttendanceRepo struct {
	db *sqlx.DB
}

func NewAttendanceRepo(db *sqlx.DB) *AttendanceRepo {
	return &AttendanceRepo{db: db}
}

// FindByUserAndDate ดึงบันทึกเข้างานของ user ในวันที่ระบุ
// คืนค่า nil ถ้ายังไม่มีบันทึก (ยังไม่เช็คอิน)
func (r *AttendanceRepo) FindByUserAndDate(ctx context.Context, userID uuid.UUID, date time.Time) (*domain.Attendance, error) {
	var att domain.Attendance
	err := r.db.GetContext(ctx, &att, `
		SELECT * FROM attendance WHERE user_id = $1 AND date = $2
	`, userID, date.Format("2006-01-02"))
	if err != nil {
		// sql.ErrNoRows ไม่ถือว่าเป็น error จริงจังเพราะหมายถึงยังไม่ได้เช็คอิน
		return nil, err
	}
	return &att, nil
}

// CreateCheckIn บันทึกเช็คอิน (สร้างแถวใหม่ในตาราง attendance)
// เวลาเช็คอินจะถูกเซ็ตเป็นเวลาปัจจุบันของ Server เสมอ (ป้องกันการแก้เวลา)
func (r *AttendanceRepo) CreateCheckIn(ctx context.Context, att *domain.Attendance) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO attendance (id, user_id, date, check_in_at, status, check_in_lat, check_in_lng, check_in_photo, location_id)
		VALUES (:id, :user_id, :date, :check_in_at, :status, :check_in_lat, :check_in_lng, :check_in_photo, :location_id)
	`, att)
	return err
}

// UpdateCheckOut อัปเดตเวลาเช็คเอาท์ (ใส่ข้อมูลออกงานในแถวที่มีอยู่แล้ว)
func (r *AttendanceRepo) UpdateCheckOut(ctx context.Context, id uuid.UUID, checkOutAt time.Time, lat, lng *float64, photoURL *string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE attendance 
		SET check_out_at = $1, check_out_lat = $2, check_out_lng = $3, check_out_photo = $4
		WHERE id = $5
	`, checkOutAt, lat, lng, photoURL, id)
	return err
}

// ListByUserAndMonth ดึงประวัติเข้างานของ user ทั้งเดือน
func (r *AttendanceRepo) ListByUserAndMonth(ctx context.Context, userID uuid.UUID, year, month int) ([]domain.Attendance, error) {
	var records []domain.Attendance
	err := r.db.SelectContext(ctx, &records, `
		SELECT * FROM attendance 
		WHERE user_id = $1 AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3
		ORDER BY date ASC
	`, userID, year, month)
	if err != nil {
		log.Printf("[Repo Error] ListByUserAndMonth query failed: %v", err)
		return nil, err
	}
	return records, nil
}

// ListByDate ดึงบันทึกเข้างานของพนักงานทุกคนในวันที่ระบุ (สำหรับ Admin Dashboard)
func (r *AttendanceRepo) ListByDate(ctx context.Context, date time.Time) ([]domain.Attendance, error) {
	var records []domain.Attendance
	err := r.db.SelectContext(ctx, &records, `
		SELECT * FROM attendance WHERE date = $1 ORDER BY check_in_at ASC
	`, date.Format("2006-01-02"))
	if err != nil {
		log.Printf("[Repo Error] ListByDate query failed: %v", err)
		return nil, err
	}
	return records, nil
}

// ListByMonthAllUsers ดึงบันทึกเข้างานของพนักงานทุกคนในเดือนที่ระบุ (สำหรับ Admin History)
func (r *AttendanceRepo) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.Attendance, error) {
	var records []domain.Attendance
	err := r.db.SelectContext(ctx, &records, `
		SELECT * FROM attendance 
		WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
		ORDER BY date DESC, check_in_at DESC
	`, year, month)
	if err != nil {
		log.Printf("[Repo Error] ListByMonthAllUsers query failed: %v", err)
		return nil, err
	}
	return records, nil
}

// ListByUser ดึงประวัติเข้างานทั้งหมดของ user (เรียงจากใหม่ไปเก่า)
func (r *AttendanceRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Attendance, error) {
	var records []domain.Attendance
	err := r.db.SelectContext(ctx, &records, `
		SELECT * FROM attendance WHERE user_id = $1 ORDER BY date DESC
	`, userID)
	if err != nil {
		log.Printf("[Repo Error] ListByUser query failed: %v", err)
		return nil, err
	}
	return records, nil
}
