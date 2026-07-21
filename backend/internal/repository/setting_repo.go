package repository

import (
	"context"
	"database/sql"

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
