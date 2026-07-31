package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// BackupRepo persists backup and restore job metadata.
type BackupRepo struct {
	db *sqlx.DB
}

func NewBackupRepo(db *sqlx.DB) *BackupRepo {
	return &BackupRepo{db: db}
}

func (r *BackupRepo) EnsureTable(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS backup_jobs (
			id UUID PRIMARY KEY,
			operation TEXT NOT NULL CHECK (operation IN ('backup', 'restore')),
			status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
			schema_version TEXT NOT NULL,
			database_object_key TEXT,
			manifest_object_key TEXT,
			table_manifest_object_key TEXT,
			source_backup_id UUID,
			triggered_by UUID,
			file_count INTEGER NOT NULL DEFAULT 0,
			database_size_bytes BIGINT NOT NULL DEFAULT 0,
			note TEXT NOT NULL DEFAULT '',
			description TEXT NOT NULL DEFAULT '',
			error_message TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			started_at TIMESTAMPTZ,
			finished_at TIMESTAMPTZ
		);
		CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at ON backup_jobs(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_backup_jobs_status ON backup_jobs(status);
		CREATE INDEX IF NOT EXISTS idx_backup_jobs_operation ON backup_jobs(operation);
	`)
	if err != nil {
		return fmt.Errorf("สร้างตาราง backup_jobs ไม่สำเร็จ: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, `ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS table_manifest_object_key TEXT`); err != nil {
		return fmt.Errorf("เพิ่มคอลัมน์ table manifest ไม่สำเร็จ: %w", err)
	}
	if _, err := r.db.ExecContext(ctx, `ALTER TABLE backup_jobs ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''`); err != nil {
		return fmt.Errorf("เพิ่มโน้ตของจุดเซฟไม่สำเร็จ: %w", err)
	}
	// backup_jobs must survive a public-schema restore, so it cannot depend on users.
	if _, err := r.db.ExecContext(ctx, `ALTER TABLE backup_jobs DROP CONSTRAINT IF EXISTS backup_jobs_triggered_by_fkey`); err != nil {
		return fmt.Errorf("ปรับความสัมพันธ์ตาราง backup_jobs ไม่สำเร็จ: %w", err)
	}
	// A restore source may exist only as metadata in remote backup storage, so
	// the Local job table cannot require a matching source row.
	if _, err := r.db.ExecContext(ctx, `ALTER TABLE backup_jobs DROP CONSTRAINT IF EXISTS backup_jobs_source_backup_id_fkey`); err != nil {
		return fmt.Errorf("ปรับความสัมพันธ์ source backup ไม่สำเร็จ: %w", err)
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE backup_jobs
		SET status = 'failed',
			error_message = 'API restarted while the backup job was running',
			finished_at = NOW()
		WHERE status IN ('queued', 'running')
	`)
	if err != nil {
		return fmt.Errorf("กู้สถานะ backup_jobs ไม่สำเร็จ: %w", err)
	}

	return nil
}

func (r *BackupRepo) HasActiveJob(ctx context.Context) (bool, error) {
	var count int
	if err := r.db.GetContext(ctx, &count, `
		SELECT COUNT(*)
		FROM backup_jobs
		WHERE status IN ('queued', 'running')
	`); err != nil {
		return false, fmt.Errorf("ตรวจสอบงาน backup ที่กำลังทำงานไม่สำเร็จ: %w", err)
	}
	return count > 0, nil
}

func (r *BackupRepo) Create(ctx context.Context, job *domain.BackupJob) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO backup_jobs (
			id, operation, status, schema_version, database_object_key,
			manifest_object_key, table_manifest_object_key, source_backup_id, triggered_by, file_count,
			database_size_bytes, note, description, error_message, created_at,
			started_at, finished_at
		) VALUES (
			:id, :operation, :status, :schema_version, :database_object_key,
			:manifest_object_key, :table_manifest_object_key, :source_backup_id, :triggered_by, :file_count,
			:database_size_bytes, :note, :description, :error_message, :created_at,
			:started_at, :finished_at
		)
	`, job)
	if err != nil {
		return fmt.Errorf("บันทึกงาน backup ไม่สำเร็จ: %w", err)
	}
	return nil
}

func (r *BackupRepo) Get(ctx context.Context, id uuid.UUID) (*domain.BackupJob, error) {
	var job domain.BackupJob
	if err := r.db.GetContext(ctx, &job, backupJobSelect+` WHERE id = $1`, id); err != nil {
		return nil, fmt.Errorf("โหลดงาน backup ไม่สำเร็จ: %w", err)
	}
	return &job, nil
}

func (r *BackupRepo) List(ctx context.Context, limit int) ([]domain.BackupJob, error) {
	jobs := []domain.BackupJob{}
	if err := r.db.SelectContext(ctx, &jobs, backupJobSelect+` ORDER BY created_at DESC LIMIT $1`, limit); err != nil {
		return nil, fmt.Errorf("โหลดรายการ backup ไม่สำเร็จ: %w", err)
	}
	return jobs, nil
}

func (r *BackupRepo) MarkRunning(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE backup_jobs
		SET status = 'running', started_at = NOW()
		WHERE id = $1
	`, id)
	return err
}

func (r *BackupRepo) MarkSucceeded(ctx context.Context, id uuid.UUID, databaseKey, manifestKey, tableManifestKey string, fileCount int, databaseSize int64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE backup_jobs
		SET status = 'succeeded',
			database_object_key = $2,
			manifest_object_key = NULLIF($3, ''),
			table_manifest_object_key = $4,
			file_count = $5,
			database_size_bytes = $6,
			finished_at = NOW()
		WHERE id = $1
	`, id, databaseKey, manifestKey, tableManifestKey, fileCount, databaseSize)
	return err
}

func (r *BackupRepo) MarkCompleted(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE backup_jobs
		SET status = 'succeeded', finished_at = NOW()
		WHERE id = $1
	`, id)
	return err
}

func (r *BackupRepo) MarkFailed(ctx context.Context, id uuid.UUID, message string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE backup_jobs
		SET status = 'failed', error_message = $2, finished_at = NOW()
		WHERE id = $1
	`, id, message)
	return err
}

func (r *BackupRepo) DeleteExpired(ctx context.Context, before time.Time) ([]domain.BackupJob, error) {
	jobs := []domain.BackupJob{}
	if err := r.db.SelectContext(ctx, &jobs, backupJobSelect+`
		WHERE operation = 'backup'
		  AND status = 'succeeded'
		  AND created_at < $1
		ORDER BY created_at ASC
	`, before); err != nil {
		return nil, fmt.Errorf("โหลด backup ที่หมดอายุไม่สำเร็จ: %w", err)
	}
	return jobs, nil
}

func (r *BackupRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM backup_jobs WHERE id = $1`, id)
	return err
}

const backupJobSelect = `
	SELECT id, operation, status, schema_version, database_object_key,
		manifest_object_key, table_manifest_object_key, source_backup_id, triggered_by, file_count,
		database_size_bytes, note, description, error_message, created_at,
		started_at, finished_at
	FROM backup_jobs
`
