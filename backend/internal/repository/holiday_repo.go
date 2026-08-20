package repository

import (
	"context"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// HolidayRepo จัดการ SQL queries สำหรับตาราง holidays (วันหยุด)
type HolidayRepo struct {
	db *sqlx.DB
}

// IsHoliday includes every day covered by a multi-day annual holiday.
func (r *HolidayRepo) IsHoliday(ctx context.Context, date time.Time) (bool, error) {
	var exists bool
	err := r.db.GetContext(ctx, &exists, `
		SELECT EXISTS (
			SELECT 1
			FROM holidays
			WHERE $1::date BETWEEN date AND date + (GREATEST(COALESCE(num_days, 1), 1) - 1)
		)
	`, date.Format("2006-01-02"))
	return exists, err
}

func NewHolidayRepo(db *sqlx.DB) *HolidayRepo {
	return &HolidayRepo{db: db}
}

// ListByYear ดึงวันหยุดทั้งปี
func (r *HolidayRepo) ListByYear(ctx context.Context, year int) ([]domain.Holiday, error) {
	var holidays []domain.Holiday
	err := r.db.SelectContext(ctx, &holidays, `
		SELECT * FROM holidays WHERE EXTRACT(YEAR FROM date) = $1 ORDER BY date ASC
	`, year)
	if err != nil {
		return nil, err
	}
	return holidays, nil
}

// Create เพิ่มวันหยุดใหม่ (Admin เท่านั้น)
func (r *HolidayRepo) Create(ctx context.Context, h *domain.Holiday) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO holidays (id, date, name, num_days) VALUES (:id, :date, :name, :num_days)
	`, h)
	return err
}

// Delete ลบวันหยุด (Admin เท่านั้น)
func (r *HolidayRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM holidays WHERE id = $1`, id)
	return err
}
