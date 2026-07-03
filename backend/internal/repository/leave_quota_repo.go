package repository

import (
	"context"
	"database/sql"
	"errors"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type LeaveQuotaRepo struct {
	db *sqlx.DB
}

func NewLeaveQuotaRepo(db *sqlx.DB) *LeaveQuotaRepo {
	return &LeaveQuotaRepo{db: db}
}

func (r *LeaveQuotaRepo) GetQuota(ctx context.Context, userID uuid.UUID, year int) (*domain.LeaveQuota, error) {
	query := `
		SELECT id, user_id, year, sick_leave, personal_leave, annual_leave, created_at, updated_at
		FROM leave_quotas
		WHERE user_id = $1 AND year = $2
	`
	var q domain.LeaveQuota
	err := r.db.GetContext(ctx, &q, query, userID, year)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil // Return nil if no quota is found
		}
		return nil, err
	}
	return &q, nil
}

func (r *LeaveQuotaRepo) UpsertQuota(ctx context.Context, quota *domain.LeaveQuota) error {
	query := `
		INSERT INTO leave_quotas (user_id, year, sick_leave, personal_leave, annual_leave, updated_at)
		VALUES (:user_id, :year, :sick_leave, :personal_leave, :annual_leave, NOW())
		ON CONFLICT (user_id, year) DO UPDATE SET
			sick_leave = EXCLUDED.sick_leave,
			personal_leave = EXCLUDED.personal_leave,
			annual_leave = EXCLUDED.annual_leave,
			updated_at = NOW()
	`
	_, err := r.db.NamedExecContext(ctx, query, quota)
	return err
}
