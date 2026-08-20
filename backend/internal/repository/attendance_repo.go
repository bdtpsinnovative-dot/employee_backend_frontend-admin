package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// AttendanceRepo จัดการ SQL queries สำหรับตาราง attendance (บันทึกลงเวลา)
type AttendanceRepo struct {
	db *sqlx.DB
}

func NewAttendanceRepo(db *sqlx.DB) *AttendanceRepo {
	return &AttendanceRepo{db: db}
}

// Keep attendance columns explicit. Legacy backends used SELECT * and therefore
// attendance metadata intentionally lives in a separate table during rollout.
const attendanceSelect = `
	SELECT
		a.id, a.user_id, a.date, a.check_in_at, a.check_out_at, a.status,
		a.check_in_lat, a.check_in_lng, a.check_out_lat, a.check_out_lng,
		a.check_in_photo, a.check_out_photo, a.location_id, a.created_at,
		to_char(COALESCE(am.scheduled_start, TIME '09:00'), 'HH24:MI') AS work_start_time,
		to_char(COALESCE(am.scheduled_end, TIME '18:00'), 'HH24:MI') AS work_end_time,
		COALESCE(am.is_workday, EXTRACT(ISODOW FROM a.date) BETWEEN 1 AND 5) AS is_workday,
		COALESCE(am.is_offsite, a.status = 'offsite') AS is_offsite,
		COALESCE(am.late_minutes, 0) AS late_minutes,
		COALESCE(NULLIF(am.check_in_location_name, ''), wl.name, '') AS location_name,
		am.check_in_distance_m, am.check_in_accuracy_m,
		am.check_out_location_id,
		COALESCE(am.check_out_location_name, '') AS check_out_location_name,
		am.check_out_distance_m, am.check_out_accuracy_m
	FROM attendance a
	LEFT JOIN attendance_metadata am ON am.attendance_id = a.id
	LEFT JOIN work_locations wl ON wl.id = a.location_id`

// FindByUserAndDate ดึงบันทึกเข้างานของ user ในวันที่ระบุ
// คืนค่า nil ถ้ายังไม่มีบันทึก (ยังไม่เช็คอิน)
func (r *AttendanceRepo) FindByUserAndDate(ctx context.Context, userID uuid.UUID, date time.Time) (*domain.Attendance, error) {
	var att domain.Attendance
	err := r.db.GetContext(ctx, &att, attendanceSelect+`
		WHERE a.user_id = $1 AND a.date = $2
	`, userID, date.Format("2006-01-02"))
	if err != nil {
		// sql.ErrNoRows ไม่ถือว่าเป็น error จริงจังเพราะหมายถึงยังไม่ได้เช็คอิน
		return nil, err
	}
	return &att, nil
}

func (r *AttendanceRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.Attendance, error) {
	var att domain.Attendance
	if err := r.db.GetContext(ctx, &att, attendanceSelect+` WHERE a.id = $1`, id); err != nil {
		return nil, err
	}
	return &att, nil
}

// CreateCheckIn บันทึกเช็คอิน (สร้างแถวใหม่ในตาราง attendance)
// เวลาเช็คอินจะถูกเซ็ตเป็นเวลาปัจจุบันของ Server เสมอ (ป้องกันการแก้เวลา)
func (r *AttendanceRepo) CreateCheckIn(ctx context.Context, att *domain.Attendance) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.NamedExecContext(ctx, `
		INSERT INTO attendance (id, user_id, date, check_in_at, status, check_in_lat, check_in_lng, check_in_photo, location_id)
		VALUES (:id, :user_id, :date, :check_in_at, :status, :check_in_lat, :check_in_lng, :check_in_photo, :location_id)
	`, att)
	if err != nil {
		return err
	}
	if err := upsertAttendanceMetadata(ctx, tx, att); err != nil {
		return err
	}
	return tx.Commit()
}

// UpdateCheckOut อัปเดตเวลาเช็คเอาท์ (ใส่ข้อมูลออกงานในแถวที่มีอยู่แล้ว)
func (r *AttendanceRepo) UpdateCheckOut(ctx context.Context, att *domain.Attendance) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	_, err = tx.ExecContext(ctx, `
		UPDATE attendance 
		SET check_out_at = $1, check_out_lat = $2, check_out_lng = $3, check_out_photo = $4
		WHERE id = $5
	`, att.CheckOutAt, att.CheckOutLat, att.CheckOutLng, att.CheckOutPhoto, att.ID)
	if err != nil {
		return err
	}
	if err := upsertAttendanceMetadata(ctx, tx, att); err != nil {
		return err
	}
	return tx.Commit()
}

func upsertAttendanceMetadata(ctx context.Context, tx *sqlx.Tx, att *domain.Attendance) error {
	startTime := att.WorkStartTime
	if startTime == "" {
		startTime = "09:00"
	}
	endTime := att.WorkEndTime
	if endTime == "" {
		endTime = "18:00"
	}

	_, err := tx.ExecContext(ctx, `
		INSERT INTO attendance_metadata (
			attendance_id, scheduled_start, scheduled_end, is_workday,
			is_offsite, late_minutes, check_in_location_name,
			check_in_distance_m, check_in_accuracy_m,
			check_out_location_id, check_out_location_name,
			check_out_distance_m, check_out_accuracy_m
		)
		VALUES ($1, $2::time, $3::time, $4, $5, $6, NULLIF($7, ''), $8, $9, $10, NULLIF($11, ''), $12, $13)
		ON CONFLICT (attendance_id) DO UPDATE SET
			scheduled_start = EXCLUDED.scheduled_start,
			scheduled_end = EXCLUDED.scheduled_end,
			is_workday = EXCLUDED.is_workday,
			is_offsite = EXCLUDED.is_offsite,
			late_minutes = EXCLUDED.late_minutes,
			check_in_location_name = COALESCE(EXCLUDED.check_in_location_name, attendance_metadata.check_in_location_name),
			check_in_distance_m = COALESCE(EXCLUDED.check_in_distance_m, attendance_metadata.check_in_distance_m),
			check_in_accuracy_m = COALESCE(EXCLUDED.check_in_accuracy_m, attendance_metadata.check_in_accuracy_m),
			check_out_location_id = EXCLUDED.check_out_location_id,
			check_out_location_name = EXCLUDED.check_out_location_name,
			check_out_distance_m = EXCLUDED.check_out_distance_m,
			check_out_accuracy_m = EXCLUDED.check_out_accuracy_m,
			updated_at = NOW()
	`,
		att.ID, startTime, endTime, att.IsWorkday, att.IsOffsite,
		att.LateMinutes, att.LocationName, att.CheckInDistanceM,
		att.CheckInAccuracyM, att.CheckOutLocationID,
		att.CheckOutLocationName, att.CheckOutDistanceM, att.CheckOutAccuracyM,
	)
	return err
}

// ListByUserAndMonth ดึงประวัติเข้างานของ user ทั้งเดือน
func (r *AttendanceRepo) ListByUserAndMonth(ctx context.Context, userID uuid.UUID, year, month int) ([]domain.Attendance, error) {
	var records []domain.Attendance
	err := r.db.SelectContext(ctx, &records, attendanceSelect+`
		WHERE a.user_id = $1 AND EXTRACT(YEAR FROM a.date) = $2 AND EXTRACT(MONTH FROM a.date) = $3
		ORDER BY a.date ASC
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
	err := r.db.SelectContext(ctx, &records, attendanceSelect+`
		WHERE a.date = $1 ORDER BY a.check_in_at ASC
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
	err := r.db.SelectContext(ctx, &records, attendanceSelect+`
		WHERE EXTRACT(YEAR FROM a.date) = $1 AND EXTRACT(MONTH FROM a.date) = $2
		ORDER BY a.date DESC, a.check_in_at DESC
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
	err := r.db.SelectContext(ctx, &records, attendanceSelect+`
		WHERE a.user_id = $1 ORDER BY a.date DESC
	`, userID)
	if err != nil {
		log.Printf("[Repo Error] ListByUser query failed: %v", err)
		return nil, err
	}
	return records, nil
}

// UpdateByAdmin updates an attendance record and appends an immutable audit row.
func (r *AttendanceRepo) UpdateByAdmin(ctx context.Context, before, after *domain.Attendance, changedBy uuid.UUID) error {
	oldValues, err := json.Marshal(before)
	if err != nil {
		return fmt.Errorf("encode old attendance: %w", err)
	}
	newValues, err := json.Marshal(after)
	if err != nil {
		return fmt.Errorf("encode new attendance: %w", err)
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err = tx.ExecContext(ctx, `
		UPDATE attendance
		SET check_in_at = $1, check_out_at = $2, status = $3
		WHERE id = $4
	`, after.CheckInAt, after.CheckOutAt, after.Status, after.ID); err != nil {
		return err
	}
	if err = upsertAttendanceMetadata(ctx, tx, after); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `
		INSERT INTO attendance_audit_logs (attendance_id, changed_by, old_values, new_values)
		VALUES ($1, $2, $3::jsonb, $4::jsonb)
	`, after.ID, changedBy, string(oldValues), string(newValues)); err != nil {
		return err
	}
	return tx.Commit()
}
