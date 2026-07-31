package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// BackupJob tracks a database snapshot or restore operation.
type BackupJob struct {
	ID                     uuid.UUID         `db:"id" json:"id"`
	Operation              string            `db:"operation" json:"operation"`
	Status                 string            `db:"status" json:"status"`
	SchemaVersion          string            `db:"schema_version" json:"schema_version"`
	DatabaseObjectKey      *string           `db:"database_object_key" json:"-"`
	ManifestObjectKey      *string           `db:"manifest_object_key" json:"-"`
	TableManifestObjectKey *string           `db:"table_manifest_object_key" json:"-"`
	SourceBackupID         *uuid.UUID        `db:"source_backup_id" json:"source_backup_id,omitempty"`
	TriggeredBy            *uuid.UUID        `db:"triggered_by" json:"triggered_by,omitempty"`
	FileCount              int               `db:"file_count" json:"file_count"`
	DatabaseSizeBytes      int64             `db:"database_size_bytes" json:"database_size_bytes"`
	Note                   string            `db:"note" json:"note"`
	Description            string            `db:"description" json:"description"`
	ErrorMessage           *string           `db:"error_message" json:"error_message,omitempty"`
	CreatedAt              time.Time         `db:"created_at" json:"created_at"`
	StartedAt              *time.Time        `db:"started_at" json:"started_at,omitempty"`
	FinishedAt             *time.Time        `db:"finished_at" json:"finished_at,omitempty"`
	TableStats             []BackupTableStat `db:"-" json:"table_stats,omitempty"`
}

// BackupTableStat compares the row count saved in a snapshot with the current
// Local database. It is informational and is never accepted as restore input.
type BackupTableStat struct {
	Name         string `json:"name"`
	SnapshotRows int    `json:"snapshot_rows"`
	CurrentRows  int    `json:"current_rows"`
}

// BackupManifest describes the R2 objects included in a backup.
type BackupManifest struct {
	SchemaVersion string                 `json:"schema_version"`
	CreatedAt     time.Time              `json:"created_at"`
	Objects       []BackupManifestObject `json:"objects"`
}

// BackupManifestObject identifies one application file stored in R2.
type BackupManifestObject struct {
	Key         string `json:"key"`
	Size        int64  `json:"size"`
	ETag        string `json:"etag,omitempty"`
	ContentType string `json:"content_type,omitempty"`
}

// BackupTableSnapshot stores a JSON representation of one application table.
// The table allowlist is enforced by the backup service before this is created
// or restored; table names are never accepted directly from SQL input.
type BackupTableSnapshot struct {
	Name     string          `json:"name"`
	Rows     json.RawMessage `json:"rows"`
	RowCount int             `json:"row_count,omitempty"`
}

// BackupTableManifest contains table-level snapshots used by Local restores.
type BackupTableManifest struct {
	SchemaVersion string                `json:"schema_version"`
	CreatedAt     time.Time             `json:"created_at"`
	Tables        []BackupTableSnapshot `json:"tables"`
}

// BackupMetadata is stored beside each Production backup in R2 so a Local
// backend can list and restore backups without connecting to Production DB.
type BackupMetadata struct {
	ID                     uuid.UUID `json:"id"`
	Operation              string    `json:"operation"`
	Status                 string    `json:"status"`
	SchemaVersion          string    `json:"schema_version"`
	DatabaseObjectKey      string    `json:"database_object_key"`
	ManifestObjectKey      string    `json:"manifest_object_key"`
	TableManifestObjectKey string    `json:"table_manifest_object_key"`
	FileCount              int       `json:"file_count"`
	DatabaseSizeBytes      int64     `json:"database_size_bytes"`
	Note                   string    `json:"note"`
	Description            string    `json:"description"`
	CreatedAt              time.Time `json:"created_at"`
	FinishedAt             time.Time `json:"finished_at"`
}
