package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

const (
	backupRetentionDays    = 30
	productionBackupPrefix = "backups/"
	localBackupPrefix      = "local-backups/"
)

var (
	ErrBackupInProgress       = errors.New("มีงาน backup หรือ restore กำลังทำงานอยู่")
	ErrRestoreDisabled        = errors.New("การกู้คืนเปิดใช้งานเฉพาะ Local เท่านั้น")
	ErrRestoreSelectionNeeded = errors.New("กรุณาเลือกอย่างน้อยหนึ่งตารางสำหรับกู้คืน")
	ErrBackupDisabled         = errors.New("การสร้างจุดเซฟยังไม่ได้เปิดใช้งาน")
)

type backupArtifact struct {
	id                     uuid.UUID
	databaseObjectKey      string
	tableManifestObjectKey string
	databaseSize           int64
}

var backupTables = []string{
	"users",
	"work_locations",
	"brands",
	"brand_responsibilities",
	"task_categories",
	"tasks",
	"leave_quotas",
	"attendance",
	"leave_requests",
	"offsite_requests",
	"holidays",
	"settings",
	"notifications",
	"task_assignees",
	"task_lists",
	"task_cards",
	"card_assignees",
	"task_sub_items",
	"list_assignees",
	"card_attachments",
	"sub_item_verifications",
	"task_events",
}

// BackupService runs asynchronous database-only snapshot jobs.
type BackupService struct {
	repo           *repository.BackupRepo
	db             *sqlx.DB
	databaseURL    string
	backupStorage  *StorageService
	maintenance    *middleware.MaintenanceGate
	schemaVersion  string
	appEnv         string
	restoreEnabled bool
	backupEnabled  bool
}

func NewBackupService(
	repo *repository.BackupRepo,
	db *sqlx.DB,
	databaseURL string,
	backupStorage *StorageService,
	maintenance *middleware.MaintenanceGate,
	appEnv string,
	restoreEnabled bool,
	backupEnabled bool,
	restoreTarget string,
) (*BackupService, error) {
	if db == nil || backupStorage == nil {
		return nil, errors.New("ไม่สามารถเริ่มระบบ backup ได้: ที่เก็บ snapshot ยังไม่พร้อมใช้งาน")
	}

	schemaVersion, err := calculateSchemaVersion("migrations")
	if err != nil {
		return nil, err
	}

	snapshotEnabled, safeRestoreEnabled := backupAvailabilityForTarget(
		appEnv,
		databaseURL,
		backupEnabled,
		restoreEnabled,
		restoreTarget,
	)

	return &BackupService{
		repo:           repo,
		db:             db,
		databaseURL:    databaseURL,
		backupStorage:  backupStorage,
		maintenance:    maintenance,
		schemaVersion:  schemaVersion,
		appEnv:         appEnv,
		restoreEnabled: restoreEnabled && safeRestoreEnabled,
		backupEnabled:  snapshotEnabled,
	}, nil
}

func backupAvailability(appEnv, databaseURL string, enabled bool) (backupEnabled, restoreEnabled bool) {
	return backupAvailabilityForTarget(appEnv, databaseURL, enabled, enabled, "local")
}

func backupAvailabilityForTarget(appEnv, databaseURL string, backupEnabled, restoreRequested bool, restoreTarget string) (snapshotEnabled, restoreEnabled bool) {
	if isProductionEnvironment(appEnv) {
		return true, restoreRequested && strings.EqualFold(strings.TrimSpace(restoreTarget), "production")
	}
	if !backupEnabled {
		return false, false
	}
	return true, restoreRequested && strings.EqualFold(strings.TrimSpace(restoreTarget), "local") && isLocalDatabaseTarget(databaseURL)
}

func isProductionEnvironment(appEnv string) bool {
	return strings.EqualFold(strings.TrimSpace(appEnv), "production")
}

func isLocalDatabaseTarget(databaseURL string) bool {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	switch host {
	case "localhost", "127.0.0.1", "::1", "db", "postgres", "host.docker.internal":
		return true
	default:
		return strings.HasSuffix(host, ".local")
	}
}

func (s *BackupService) List(ctx context.Context) ([]domain.BackupJob, error) {
	jobs, err := s.repo.List(ctx, 100)
	if err != nil {
		return nil, err
	}
	storageJobs, err := s.listStorageMetadata(ctx)
	if err != nil {
		return nil, err
	}
	byID := make(map[uuid.UUID]domain.BackupJob, len(jobs)+len(storageJobs))
	for _, job := range jobs {
		byID[job.ID] = job
	}
	for _, job := range storageJobs {
		if _, exists := byID[job.ID]; !exists {
			byID[job.ID] = job
		}
	}
	merged := make([]domain.BackupJob, 0, len(byID))
	for _, job := range byID {
		merged = append(merged, job)
	}
	sort.Slice(merged, func(i, j int) bool { return merged[i].CreatedAt.After(merged[j].CreatedAt) })
	if len(merged) > 100 {
		merged = merged[:100]
	}
	if len(merged) > 0 {
		currentRows, err := s.currentTableRowCounts(ctx)
		if err != nil {
			return nil, err
		}
		for i := range merged {
			s.attachTableStats(ctx, &merged[i], currentRows)
		}
	}
	return merged, nil
}

func (s *BackupService) StartBackup(ctx context.Context, triggeredBy uuid.UUID, note string) (*domain.BackupJob, error) {
	if !s.backupEnabled {
		return nil, ErrBackupDisabled
	}
	if err := s.ensureNoActiveJob(ctx); err != nil {
		return nil, err
	}

	job := &domain.BackupJob{
		ID:            uuid.New(),
		Operation:     "backup",
		Status:        "queued",
		SchemaVersion: s.schemaVersion,
		TriggeredBy:   &triggeredBy,
		Note:          strings.TrimSpace(note),
		Description:   "สำรองข้อมูลโดย Admin",
		CreatedAt:     time.Now(),
	}
	if err := s.repo.Create(ctx, job); err != nil {
		return nil, err
	}

	go s.runBackup(job.ID)
	return job, nil
}

func (s *BackupService) StartRestore(ctx context.Context, backupID, triggeredBy uuid.UUID) (*domain.BackupJob, error) {
	return s.StartRestoreTables(ctx, backupID, triggeredBy, s.TableOptions())
}

func (s *BackupService) StartRestoreTables(ctx context.Context, backupID, triggeredBy uuid.UUID, selectedTables []string) (*domain.BackupJob, error) {
	if !s.restoreEnabled {
		return nil, ErrRestoreDisabled
	}
	if len(selectedTables) == 0 {
		return nil, ErrRestoreSelectionNeeded
	}
	if err := s.ensureNoActiveJob(ctx); err != nil {
		return nil, err
	}

	source, err := s.getSourceBackup(ctx, backupID)
	if err != nil {
		return nil, err
	}
	if source.Operation != "backup" || source.Status != "succeeded" {
		return nil, errors.New("เลือกได้เฉพาะ backup ที่สำเร็จแล้วเท่านั้น")
	}
	if source.SchemaVersion != s.schemaVersion {
		return nil, errors.New("backup นี้ไม่เข้ากันกับ schema ปัจจุบันของระบบ")
	}
	if source.DatabaseObjectKey == nil {
		return nil, errors.New("backup นี้ไม่มี snapshot ฐานข้อมูลสำหรับกู้คืน")
	}
	if source.TableManifestObjectKey == nil {
		return nil, errors.New("backup นี้ไม่มี snapshot รายตาราง กรุณาสร้าง backup จุดใหม่")
	}

	job := &domain.BackupJob{
		ID:             uuid.New(),
		Operation:      "restore",
		Status:         "queued",
		SchemaVersion:  s.schemaVersion,
		SourceBackupID: &backupID,
		TriggeredBy:    &triggeredBy,
		Description:    "กู้คืนข้อมูล Production เข้า Local โดย Admin",
		CreatedAt:      time.Now(),
	}
	if err := s.repo.Create(ctx, job); err != nil {
		return nil, err
	}

	go s.runRestore(job.ID, *source, triggeredBy, selectedTables)
	return job, nil
}

func (s *BackupService) Get(ctx context.Context, id uuid.UUID) (*domain.BackupJob, error) {
	job, err := s.getSourceBackup(ctx, id)
	if err != nil {
		return nil, err
	}
	if job.Operation == "backup" && job.Status == "succeeded" && job.TableManifestObjectKey != nil {
		currentRows, err := s.currentTableRowCounts(ctx)
		if err != nil {
			return nil, err
		}
		s.attachTableStats(ctx, job, currentRows)
	}
	return job, nil
}

func (s *BackupService) getSourceBackup(ctx context.Context, id uuid.UUID) (*domain.BackupJob, error) {
	if job, err := s.repo.Get(ctx, id); err == nil {
		return job, nil
	}
	var lastErr error
	for _, prefix := range s.storageMetadataPrefixes() {
		body, err := s.backupStorage.DownloadObject(ctx, fmt.Sprintf("%s%s/metadata.json", prefix, id))
		if err != nil {
			lastErr = err
			continue
		}
		defer body.Close()
		var metadata domain.BackupMetadata
		if err := json.NewDecoder(body).Decode(&metadata); err != nil {
			return nil, err
		}
		return backupJobFromMetadata(metadata), nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, errors.New("ไม่พบ metadata ของจุดเซฟ")
}

func (s *BackupService) listStorageMetadata(ctx context.Context) ([]domain.BackupJob, error) {
	jobs := make([]domain.BackupJob, 0)
	seen := make(map[uuid.UUID]struct{})
	for _, prefix := range s.storageMetadataPrefixes() {
		objects, err := s.backupStorage.ListObjects(ctx, prefix)
		if err != nil {
			return nil, fmt.Errorf("อ่าน metadata backup ไม่สำเร็จ: %w", err)
		}
		for _, object := range objects {
			if !strings.HasSuffix(object.Key, "/metadata.json") {
				continue
			}
			body, err := s.backupStorage.DownloadObject(ctx, object.Key)
			if err != nil {
				return nil, fmt.Errorf("อ่าน metadata %s ไม่สำเร็จ: %w", object.Key, err)
			}
			var metadata domain.BackupMetadata
			decodeErr := json.NewDecoder(body).Decode(&metadata)
			body.Close()
			if decodeErr != nil {
				return nil, fmt.Errorf("อ่าน metadata %s ไม่สำเร็จ: %w", object.Key, decodeErr)
			}
			if metadata.Status == "succeeded" && metadata.Operation == "backup" {
				if _, exists := seen[metadata.ID]; exists {
					continue
				}
				seen[metadata.ID] = struct{}{}
				jobs = append(jobs, *backupJobFromMetadata(metadata))
			}
		}
	}
	return jobs, nil
}

func backupMetadataPrefixes() []string {
	return []string{productionBackupPrefix, localBackupPrefix}
}

func (s *BackupService) storageMetadataPrefixes() []string {
	if isProductionEnvironment(s.appEnv) {
		return []string{productionBackupPrefix}
	}
	return backupMetadataPrefixes()
}

func backupJobFromMetadata(metadata domain.BackupMetadata) *domain.BackupJob {
	return &domain.BackupJob{
		ID:                     metadata.ID,
		Operation:              metadata.Operation,
		Status:                 metadata.Status,
		SchemaVersion:          metadata.SchemaVersion,
		DatabaseObjectKey:      backupStringPointer(metadata.DatabaseObjectKey),
		ManifestObjectKey:      backupStringPointer(metadata.ManifestObjectKey),
		TableManifestObjectKey: backupStringPointer(metadata.TableManifestObjectKey),
		FileCount:              metadata.FileCount,
		DatabaseSizeBytes:      metadata.DatabaseSizeBytes,
		Note:                   metadata.Note,
		Description:            metadata.Description,
		CreatedAt:              metadata.CreatedAt,
		FinishedAt:             timePtr(metadata.FinishedAt),
	}
}

func backupStringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func (s *BackupService) writeMetadata(ctx context.Context, jobID uuid.UUID, artifact backupArtifact) error {
	job, err := s.repo.Get(ctx, jobID)
	if err != nil {
		return err
	}
	metadata := domain.BackupMetadata{
		ID:                     job.ID,
		Operation:              job.Operation,
		Status:                 job.Status,
		SchemaVersion:          job.SchemaVersion,
		DatabaseObjectKey:      artifact.databaseObjectKey,
		ManifestObjectKey:      "",
		TableManifestObjectKey: artifact.tableManifestObjectKey,
		FileCount:              0,
		DatabaseSizeBytes:      artifact.databaseSize,
		Note:                   job.Note,
		Description:            job.Description,
		CreatedAt:              job.CreatedAt,
		FinishedAt:             time.Now(),
	}
	metadataBytes, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("%s%s/metadata.json", s.artifactPrefix(), jobID)
	return s.backupStorage.UploadObject(ctx, strings.NewReader(string(metadataBytes)), key, "application/json")
}

func (s *BackupService) currentTableRowCounts(ctx context.Context) (map[string]int, error) {
	counts := make(map[string]int, len(backupTables))
	for _, table := range backupTables {
		var count int
		query := fmt.Sprintf("SELECT COUNT(*) FROM public.%s", safeTableIdentifier(table))
		if err := s.db.GetContext(ctx, &count, query); err != nil {
			return nil, fmt.Errorf("นับข้อมูลตาราง %s ไม่สำเร็จ: %w", table, err)
		}
		counts[table] = count
	}
	return counts, nil
}

func (s *BackupService) attachTableStats(ctx context.Context, job *domain.BackupJob, currentRows map[string]int) {
	if job.Operation != "backup" || job.Status != "succeeded" || job.TableManifestObjectKey == nil {
		return
	}
	body, err := s.backupStorage.DownloadObject(ctx, *job.TableManifestObjectKey)
	if err != nil {
		log.Printf("[Backup] อ่าน row count ของจุดเซฟ %s ไม่สำเร็จ: %v", job.ID, err)
		return
	}
	defer body.Close()

	var manifest domain.BackupTableManifest
	if err := json.NewDecoder(body).Decode(&manifest); err != nil {
		log.Printf("[Backup] อ่าน table manifest ของจุดเซฟ %s ไม่สำเร็จ: %v", job.ID, err)
		return
	}
	snapshots := make(map[string]domain.BackupTableSnapshot, len(manifest.Tables))
	for _, snapshot := range manifest.Tables {
		snapshots[snapshot.Name] = snapshot
	}

	stats := make([]domain.BackupTableStat, 0, len(manifest.Tables))
	for _, table := range backupTables {
		snapshot, ok := snapshots[table]
		if !ok {
			continue
		}
		rowCount := snapshot.RowCount
		if rowCount == 0 {
			rowCount = jsonArrayLength(snapshot.Rows)
		}
		stats = append(stats, domain.BackupTableStat{
			Name:         table,
			SnapshotRows: rowCount,
			CurrentRows:  currentRows[table],
		})
	}
	job.TableStats = stats
}

func jsonArrayLength(raw []byte) int {
	var rows []json.RawMessage
	if err := json.Unmarshal(raw, &rows); err != nil {
		return 0
	}
	return len(rows)
}

func (s *BackupService) SchemaVersion() string {
	return s.schemaVersion
}

func (s *BackupService) RestoreEnabled() bool {
	return s.restoreEnabled
}

func (s *BackupService) BackupEnabled() bool {
	return s.backupEnabled
}

func (s *BackupService) TableOptions() []string {
	return append([]string(nil), backupTables...)
}

func (s *BackupService) ensureNoActiveJob(ctx context.Context) error {
	active, err := s.repo.HasActiveJob(ctx)
	if err != nil {
		return err
	}
	if active {
		return ErrBackupInProgress
	}
	return nil
}

func (s *BackupService) runBackup(jobID uuid.UUID) {
	ctx := context.Background()
	if err := s.repo.MarkRunning(ctx, jobID); err != nil {
		log.Printf("[Backup] mark running failed for %s: %v", jobID, err)
		return
	}

	artifact, err := s.createSnapshot(ctx, jobID)
	if err != nil {
		log.Printf("[Backup] job %s failed: %v", jobID, err)
		_ = s.repo.MarkFailed(ctx, jobID, err.Error())
		return
	}
	if err := s.repo.MarkSucceeded(ctx, jobID, artifact.databaseObjectKey, "", artifact.tableManifestObjectKey, 0, artifact.databaseSize); err != nil {
		log.Printf("[Backup] mark succeeded failed for %s: %v", jobID, err)
		return
	}
	if err := s.writeMetadata(ctx, jobID, artifact); err != nil {
		log.Printf("[Backup] metadata upload failed for %s: %v", jobID, err)
		_ = s.repo.MarkFailed(ctx, jobID, err.Error())
		return
	}
	s.cleanupExpired(ctx)
}

func (s *BackupService) runRestore(jobID uuid.UUID, source domain.BackupJob, triggeredBy uuid.UUID, selectedTables []string) {
	ctx := context.Background()
	s.maintenance.Enable()
	defer s.maintenance.Disable()

	if err := s.repo.MarkRunning(ctx, jobID); err != nil {
		log.Printf("[Restore] mark running failed for %s: %v", jobID, err)
		return
	}

	rollbackID := uuid.New()
	rollback, err := s.createSnapshot(ctx, rollbackID)
	if err != nil {
		s.failRestore(ctx, jobID, fmt.Errorf("สร้างจุดย้อนกลับก่อน restore ไม่สำเร็จ: %w", err))
		return
	}

	rollbackJob := &domain.BackupJob{
		ID:                     rollback.id,
		Operation:              "backup",
		Status:                 "succeeded",
		SchemaVersion:          s.schemaVersion,
		DatabaseObjectKey:      &rollback.databaseObjectKey,
		TableManifestObjectKey: &rollback.tableManifestObjectKey,
		FileCount:              0,
		DatabaseSizeBytes:      rollback.databaseSize,
		TriggeredBy:            &triggeredBy,
		Description:            "สำรองอัตโนมัติก่อนกู้คืนข้อมูล",
		CreatedAt:              time.Now(),
		FinishedAt:             timePtr(time.Now()),
	}
	if err := s.repo.Create(ctx, rollbackJob); err != nil {
		log.Printf("[Restore] could not record rollback backup %s: %v", rollbackID, err)
	}

	err = s.restoreTables(ctx, source, selectedTables)
	if err == nil {
		if markErr := s.repo.MarkCompleted(ctx, jobID); markErr != nil {
			log.Printf("[Restore] mark succeeded failed for %s: %v", jobID, markErr)
		}
		return
	}

	// Table restores run in one database transaction. A failed restore has
	// already rolled back before this point, so replaying a full database dump
	// here would be both unnecessary and less safe than preserving Local data.
	s.failRestore(ctx, jobID, err)
}

func (s *BackupService) failRestore(ctx context.Context, jobID uuid.UUID, err error) {
	log.Printf("[Restore] job %s failed: %v", jobID, err)
	if markErr := s.repo.MarkFailed(ctx, jobID, err.Error()); markErr != nil {
		log.Printf("[Restore] mark failed failed for %s: %v", jobID, markErr)
	}
}

func (s *BackupService) createSnapshot(ctx context.Context, backupID uuid.UUID) (backupArtifact, error) {
	dumpFile, err := os.CreateTemp("", "hr-backup-*.dump")
	if err != nil {
		return backupArtifact{}, fmt.Errorf("สร้างไฟล์ชั่วคราวสำหรับ backup ไม่สำเร็จ: %w", err)
	}
	dumpPath := dumpFile.Name()
	if err := dumpFile.Close(); err != nil {
		return backupArtifact{}, err
	}
	defer os.Remove(dumpPath)

	if err := runPgDump(ctx, s.databaseURL, dumpPath); err != nil {
		return backupArtifact{}, err
	}

	dumpInfo, err := os.Stat(dumpPath)
	if err != nil {
		return backupArtifact{}, err
	}

	prefix := s.artifactPrefix()
	databaseKey := fmt.Sprintf("%s%s/database.dump", prefix, backupID)
	databaseFile, err := os.Open(dumpPath)
	if err != nil {
		return backupArtifact{}, err
	}
	if err := s.backupStorage.UploadObject(ctx, databaseFile, databaseKey, "application/octet-stream"); err != nil {
		databaseFile.Close()
		return backupArtifact{}, fmt.Errorf("อัปโหลด database backup ไม่สำเร็จ: %w", err)
	}
	databaseFile.Close()

	tableManifestKey, err := s.createTableSnapshot(ctx, backupID, prefix)
	if err != nil {
		return backupArtifact{}, err
	}

	return backupArtifact{
		id:                     backupID,
		databaseObjectKey:      databaseKey,
		tableManifestObjectKey: tableManifestKey,
		databaseSize:           dumpInfo.Size(),
	}, nil
}

func (s *BackupService) artifactPrefix() string {
	if isProductionEnvironment(s.appEnv) {
		return productionBackupPrefix
	}
	return localBackupPrefix
}

func (s *BackupService) createTableSnapshot(ctx context.Context, backupID uuid.UUID, prefix string) (string, error) {
	manifest := domain.BackupTableManifest{
		SchemaVersion: s.schemaVersion,
		CreatedAt:     time.Now(),
		Tables:        make([]domain.BackupTableSnapshot, 0, len(backupTables)),
	}
	for _, table := range backupTables {
		var rows []byte
		query := fmt.Sprintf(
			`SELECT COALESCE(jsonb_agg(to_jsonb(snapshot_row)), '[]'::jsonb)
			 FROM (SELECT * FROM public.%s) AS snapshot_row`,
			safeTableIdentifier(table),
		)
		if err := s.db.GetContext(ctx, &rows, query); err != nil {
			return "", fmt.Errorf("อ่าน snapshot ตาราง %s ไม่สำเร็จ: %w", table, err)
		}
		if !json.Valid(rows) {
			return "", fmt.Errorf("snapshot ตาราง %s มีรูปแบบ JSON ไม่ถูกต้อง", table)
		}
		manifest.Tables = append(manifest.Tables, domain.BackupTableSnapshot{
			Name:     table,
			Rows:     json.RawMessage(rows),
			RowCount: jsonArrayLength(rows),
		})
	}

	manifestBytes, err := json.Marshal(manifest)
	if err != nil {
		return "", fmt.Errorf("สร้าง table manifest ไม่สำเร็จ: %w", err)
	}
	key := fmt.Sprintf("%s%s/tables.json", prefix, backupID)
	if err := s.backupStorage.UploadObject(ctx, strings.NewReader(string(manifestBytes)), key, "application/json"); err != nil {
		return "", fmt.Errorf("อัปโหลด table manifest ไม่สำเร็จ: %w", err)
	}
	return key, nil
}

func (s *BackupService) restoreTables(ctx context.Context, backup domain.BackupJob, selectedTables []string) error {
	if backup.TableManifestObjectKey == nil {
		return errors.New("ไม่พบ snapshot รายตารางของ backup นี้")
	}
	body, err := s.backupStorage.DownloadObject(ctx, *backup.TableManifestObjectKey)
	if err != nil {
		return fmt.Errorf("ดาวน์โหลด table manifest ไม่สำเร็จ: %w", err)
	}
	defer body.Close()

	var manifest domain.BackupTableManifest
	if err := json.NewDecoder(body).Decode(&manifest); err != nil {
		return fmt.Errorf("อ่าน table manifest ไม่สำเร็จ: %w", err)
	}
	snapshots := make(map[string]domain.BackupTableSnapshot, len(manifest.Tables))
	for _, snapshot := range manifest.Tables {
		snapshots[snapshot.Name] = snapshot
	}
	for _, table := range selectedTables {
		if _, ok := snapshots[table]; !ok || !isBackupTable(table) {
			return fmt.Errorf("ไม่อนุญาตให้ restore ตาราง %s", table)
		}
	}

	related := expandRelatedTables(selectedTables)
	ordered := make([]string, 0, len(related))
	for _, table := range backupTables {
		if related[table] {
			if _, ok := snapshots[table]; !ok {
				if !isOptionalBackupSnapshotTable(table) {
					return fmt.Errorf("backup ไม่มี snapshot ตาราง %s ที่เกี่ยวข้อง", table)
				}
			}
			ordered = append(ordered, table)
		}
	}
	if len(ordered) == 0 {
		return errors.New("ยังไม่ได้เลือกตารางสำหรับ restore")
	}

	quotedTables := make([]string, 0, len(ordered))
	for _, table := range ordered {
		quotedTables = append(quotedTables, "public."+safeTableIdentifier(table))
	}
	tx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return fmt.Errorf("เริ่ม transaction สำหรับ restore ไม่สำเร็จ: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "TRUNCATE TABLE "+strings.Join(quotedTables, ", ")+" RESTART IDENTITY"); err != nil {
		return fmt.Errorf("ล้างข้อมูลตารางที่เลือกไม่สำเร็จ: %w", err)
	}

	for _, table := range ordered {
		if _, ok := snapshots[table]; !ok {
			continue
		}
		query := fmt.Sprintf(
			`INSERT INTO public.%s
			 SELECT (jsonb_populate_record(NULL::public.%s, row_value)).*
			 FROM jsonb_array_elements($1::jsonb) AS row_value`,
			safeTableIdentifier(table), safeTableIdentifier(table),
		)
		if _, err := tx.ExecContext(ctx, query, []byte(snapshots[table].Rows)); err != nil {
			return fmt.Errorf("กู้คืนตาราง %s ไม่สำเร็จ: %w", table, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("ยืนยัน transaction สำหรับ restore ไม่สำเร็จ: %w", err)
	}
	return nil
}

func isOptionalBackupSnapshotTable(table string) bool {
	// Added after table-level backups were introduced. Older backups restore
	// it as empty while preserving strict checks for all original tables.
	return table == "brand_responsibilities"
}

func isBackupTable(table string) bool {
	for _, allowed := range backupTables {
		if table == allowed {
			return true
		}
	}
	return false
}

func safeTableIdentifier(table string) string {
	return `"` + strings.ReplaceAll(table, `"`, `""`) + `"`
}

// expandRelatedTables keeps foreign-key parents and children together so a
// selected restore cannot leave dangling references in Local.
func expandRelatedTables(selected []string) map[string]bool {
	relations := map[string][]string{
		"users":           {"attendance", "leave_quotas", "leave_requests", "offsite_requests", "notifications", "tasks", "task_assignees", "list_assignees", "sub_item_verifications", "brand_responsibilities", "card_assignees"},
		"work_locations":  {"attendance"},
		"brands":          {"tasks", "brand_responsibilities"},
		"task_categories": {"tasks"},
		"tasks":           {"task_assignees", "task_lists", "task_sub_items"},
		"task_lists":      {"task_cards", "list_assignees"},
		"task_cards":      {"card_attachments", "task_sub_items", "card_assignees"},
		"task_sub_items":  {"sub_item_verifications"},
	}
	related := make(map[string]bool)
	for _, table := range selected {
		related[table] = true
	}
	changed := true
	for changed {
		changed = false
		for parent, children := range relations {
			for _, child := range children {
				if related[parent] && !related[child] {
					related[child] = true
					changed = true
				}
				if related[child] && !related[parent] {
					related[parent] = true
					changed = true
				}
			}
		}
	}
	return related
}

func backupPrefixForJob(backup domain.BackupJob) string {
	if backup.DatabaseObjectKey != nil && strings.HasPrefix(*backup.DatabaseObjectKey, localBackupPrefix) {
		return localBackupPrefix
	}
	return productionBackupPrefix
}

func (s *BackupService) cleanupExpired(ctx context.Context) {
	before := time.Now().AddDate(0, 0, -backupRetentionDays)
	jobs, err := s.repo.DeleteExpired(ctx, before)
	if err != nil {
		log.Printf("[Backup] load expired jobs failed: %v", err)
		return
	}
	for _, job := range jobs {
		if err := s.backupStorage.DeletePrefix(ctx, fmt.Sprintf("%s%s/", backupPrefixForJob(job), job.ID)); err != nil {
			log.Printf("[Backup] delete expired objects failed for %s: %v", job.ID, err)
			continue
		}
		if err := s.repo.Delete(ctx, job.ID); err != nil {
			log.Printf("[Backup] delete expired metadata failed for %s: %v", job.ID, err)
		}
	}
}

func runPgDump(ctx context.Context, databaseURL, outputPath string) error {
	cliURL, err := databaseURLForCLI(databaseURL)
	if err != nil {
		return fmt.Errorf("เตรียม database URL สำหรับ pg_dump ไม่สำเร็จ: %w", err)
	}
	args := []string{
		"--format=custom",
		"--no-owner",
		"--no-acl",
		"--schema=public",
		"--exclude-table=public.backup_jobs",
		"--file", outputPath,
		cliURL,
	}
	return runCommand(ctx, postgresCLIPath("pg_dump"), args...)
}

func postgresCLIPath(command string) string {
	overrideKey := strings.ToUpper(strings.ReplaceAll(command, "-", "_")) + "_PATH"
	if override := strings.TrimSpace(os.Getenv(overrideKey)); override != "" {
		return override
	}

	for _, version := range []string{"18", "17", "16", "15", "14"} {
		if path, err := exec.LookPath(command + "-" + version); err == nil {
			return path
		}
	}

	return command
}

func databaseURLForCLI(databaseURL string) (string, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	// These parameters are useful to application drivers, but are not
	// recognised by libpq tools such as pg_dump and pg_restore.
	query.Del("pgbouncer")
	query.Del("binary_parameters")
	query.Set("options", "-c search_path=public")
	parsed.RawQuery = strings.ReplaceAll(query.Encode(), "+", "%20")
	return parsed.String(), nil
}

func runCommand(ctx context.Context, command string, args ...string) error {
	cmd := exec.CommandContext(ctx, command, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			return fmt.Errorf("%s failed: %w", command, err)
		}
		return fmt.Errorf("%s failed: %w: %s", command, err, message)
	}
	return nil
}

func calculateSchemaVersion(directory string) (string, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return "", fmt.Errorf("อ่าน migration เพื่อคำนวณ schema version ไม่สำเร็จ: %w", err)
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
	hash := sha256.New()
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		content, err := os.ReadFile(filepath.Join(directory, entry.Name()))
		if err != nil {
			return "", fmt.Errorf("อ่าน migration %s ไม่สำเร็จ: %w", entry.Name(), err)
		}
		_, _ = hash.Write([]byte(entry.Name()))
		_, _ = hash.Write(content)
	}
	return "migrations-" + hex.EncodeToString(hash.Sum(nil))[:16], nil
}

func timePtr(value time.Time) *time.Time {
	return &value
}
