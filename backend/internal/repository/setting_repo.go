package repository

import (
	"context"
	"database/sql"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type SettingRepo struct {
	db *sqlx.DB
}

func NewSettingRepo(db *sqlx.DB) *SettingRepo {
	return &SettingRepo{db: db}
}

// Get ดึงค่า config ตาม key
func (r *SettingRepo) Get(ctx context.Context, key string) (string, error) {
	var val string
	err := r.db.GetContext(ctx, &val, "SELECT value FROM settings WHERE key = $1", key)
	if err != nil {
		if err == sql.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return val, nil
}

// Upsert บันทึกหรืออัปเดตค่า config
func (r *SettingRepo) Upsert(ctx context.Context, key string, value string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO settings (key, value) VALUES ($1, $2)
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
	`, key, value)
	return err
}

func (r *SettingRepo) ListTeams(ctx context.Context) ([]domain.Team, error) {
	var teams []domain.Team
	err := r.db.SelectContext(ctx, &teams, `
		SELECT id, name, short_name, sort_order, is_active, created_at, updated_at
		FROM teams
		WHERE is_active = TRUE
		ORDER BY sort_order ASC, name ASC
	`)
	return teams, err
}

func (r *SettingRepo) CreateTeam(ctx context.Context, name, shortName string) (domain.Team, error) {
	var team domain.Team
	err := r.db.GetContext(ctx, &team, `
		INSERT INTO teams (name, short_name, sort_order)
		VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM teams), 0))
		RETURNING id, name, short_name, sort_order, is_active, created_at, updated_at
	`, name, shortName)
	if err != nil {
		return domain.Team{}, err
	}
	return team, nil
}

func (r *SettingRepo) ListPositions(ctx context.Context, teamID *uuid.UUID) ([]domain.Position, error) {
	var positions []domain.Position
	query := `
		SELECT id, team_id, name, sort_order, is_active, created_at, updated_at
		FROM positions
		WHERE is_active = TRUE
	`
	args := []any{}
	if teamID != nil {
		query += ` AND team_id = $1`
		args = append(args, *teamID)
	}
	query += ` ORDER BY sort_order ASC, name ASC`
	if err := r.db.SelectContext(ctx, &positions, query, args...); err != nil {
		return nil, err
	}
	return positions, nil
}

func (r *SettingRepo) CreatePosition(ctx context.Context, teamID uuid.UUID, name string) (domain.Position, error) {
	var position domain.Position
	err := r.db.GetContext(ctx, &position, `
		INSERT INTO positions (team_id, name, sort_order)
		VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM positions WHERE team_id = $1), 0))
		RETURNING id, team_id, name, sort_order, is_active, created_at, updated_at
	`, teamID, name)
	if err != nil {
		return domain.Position{}, err
	}
	return position, nil
}

func (r *SettingRepo) FindTeamID(ctx context.Context, value string) (*uuid.UUID, error) {
	var id uuid.UUID
	err := r.db.GetContext(ctx, &id, `
		SELECT id FROM teams
		WHERE lower(btrim(name)) = lower(btrim($1))
		   OR lower(btrim(short_name)) = lower(btrim($1))
		ORDER BY sort_order, name
		LIMIT 1
	`, value)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}
