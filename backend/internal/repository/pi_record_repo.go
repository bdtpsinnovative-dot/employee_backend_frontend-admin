package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/jmoiron/sqlx"
)

// PIRecordRepo owns the server-side, read-only PI Record query.
type PIRecordRepo struct {
	db           *sqlx.DB
	remoteURL    string
	remoteAPIKey string
	httpClient   *http.Client
}

func NewPIRecordRepo(db *sqlx.DB, remoteURL, remoteAPIKey string) *PIRecordRepo {
	return &PIRecordRepo{
		db: db, remoteURL: strings.TrimRight(strings.TrimSpace(remoteURL), "/"), remoteAPIKey: strings.TrimSpace(remoteAPIKey),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// EnsureTable keeps the schema ready while deliberately exposing no write API.
func (r *PIRecordRepo) EnsureTable(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS pi_records (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			pi_supplier TEXT NOT NULL DEFAULT '',
			record_date TEXT NOT NULL DEFAULT '',
			supplier TEXT NOT NULL DEFAULT '',
			link_file TEXT NOT NULL DEFAULT '',
			link_file_url TEXT NOT NULL DEFAULT '',
			etd TEXT NOT NULL DEFAULT '',
			brand TEXT NOT NULL DEFAULT '',
			order_no TEXT NOT NULL DEFAULT '',
			file_name TEXT NOT NULL DEFAULT '',
			file_url TEXT NOT NULL DEFAULT '',
			sale_name TEXT NOT NULL DEFAULT '',
			project_name TEXT NOT NULL DEFAULT '',
			payment_date TEXT NOT NULL DEFAULT '',
			delivered_date TEXT NOT NULL DEFAULT '',
			date_order TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_pi_records_pi_supplier ON pi_records(pi_supplier);
		CREATE INDEX IF NOT EXISTS idx_pi_records_order_no ON pi_records(order_no);
		ALTER TABLE pi_records ENABLE ROW LEVEL SECURITY;
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
				REVOKE ALL ON TABLE pi_records FROM anon;
			END IF;
			IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
				REVOKE ALL ON TABLE pi_records FROM authenticated;
			END IF;
		END
		$$;
	`)
	if err != nil {
		return fmt.Errorf("สร้างตาราง pi_records ไม่สำเร็จ: %w", err)
	}
	return nil
}

func (r *PIRecordRepo) List(ctx context.Context) ([]domain.PIRecord, error) {
	if r.remoteURL != "" {
		if r.remoteAPIKey == "" {
			return nil, fmt.Errorf("ยังไม่ได้ตั้งค่า WALLCRAFT_PI_RECORDS_API_KEY สำหรับเชื่อมข้อมูล PI Record")
		}
		return r.listRemote(ctx)
	}

	records := []domain.PIRecord{}
	if err := r.db.SelectContext(ctx, &records, `
		SELECT id, pi_supplier, record_date, supplier, link_file, link_file_url,
			etd, brand, order_no, file_name, file_url, sale_name, project_name,
			payment_date, delivered_date, date_order
		FROM pi_records
		ORDER BY created_at DESC, pi_supplier ASC
	`); err != nil {
		return nil, fmt.Errorf("โหลด PI Record ไม่สำเร็จ: %w", err)
	}
	return records, nil
}

func (r *PIRecordRepo) listRemote(ctx context.Context) ([]domain.PIRecord, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.remoteURL, nil)
	if err != nil {
		return nil, fmt.Errorf("สร้างคำขอ PI Record ไม่สำเร็จ: %w", err)
	}
	req.Header.Set("X-PI-Records-Key", r.remoteAPIKey)

	response, err := r.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("เชื่อมต่อ Wallcraft PI Record ไม่สำเร็จ: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Wallcraft PI Record ตอบกลับไม่สำเร็จ (%d)", response.StatusCode)
	}

	var body struct {
		OK   bool              `json:"ok"`
		Data []domain.PIRecord `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("อ่านข้อมูล Wallcraft PI Record ไม่สำเร็จ: %w", err)
	}
	return body.Data, nil
}
