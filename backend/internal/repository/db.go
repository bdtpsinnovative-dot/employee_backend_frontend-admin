package repository

import (
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// NewDB สร้าง connection pool ไปยัง Supabase PostgreSQL
func NewDB(databaseURL string) (*sqlx.DB, error) {
	connectionURL, err := databaseURLWithPublicSearchPath(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("เตรียม database URL ไม่สำเร็จ: %w", err)
	}
	db, err := sqlx.Connect("postgres", connectionURL)
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถเชื่อมต่อฐานข้อมูลได้: %w", err)
	}

	// ตั้งค่า connection pool (จำกัดให้ไม่เกิน 8 เพื่อเลี่ยงลิมิต 15 ของ Supabase ใน session mode)
	db.SetMaxOpenConns(8) // จำนวนการเชื่อมต่อสูงสุด
	db.SetMaxIdleConns(2) // จำนวนการเชื่อมต่อที่เก็บไว้รอ

	// ทดสอบการเชื่อมต่อ
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ฐานข้อมูลไม่ตอบสนอง: %w", err)
	}

	// สร้างตาราง tasks อัตโนมัติหากยังไม่มี (สำหรับระบบมอบหมายงาน) และเพิ่มฟีลด์ fcm_token
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			assigned_to   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title         TEXT NOT NULL,
			description   TEXT NOT NULL DEFAULT '',
			due_date      DATE,
				status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'in_review', 'completed')),
			assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
			CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

			ALTER TABLE tasks ALTER COLUMN assigned_to DROP NOT NULL;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id UUID;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS group_id UUID;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS record_kind TEXT NOT NULL DEFAULT 'legacy_assignment';
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needs_revision BOOLEAN NOT NULL DEFAULT FALSE;
			ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
		
		ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
		ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT '';
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);
		INSERT INTO settings (key, value)
		VALUES ('profile_teams', '["BD","Marketing","Graphic"]')
		ON CONFLICT (key) DO NOTHING;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS link_url TEXT;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS attachment_url TEXT;
		ALTER TABLE tasks ADD COLUMN IF NOT EXISTS link_url TEXT;
		ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachment_url TEXT;
		ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
		ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT FALSE;
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
		ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE card_attachments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium';
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress';
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS admin_comment TEXT NOT NULL DEFAULT '';
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
		ALTER TABLE task_lists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

		CREATE TABLE IF NOT EXISTS card_assignees (
			card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE,
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (card_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS list_assignees (
			list_id UUID REFERENCES task_lists(id) ON DELETE CASCADE,
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (list_id, user_id)
		);
		CREATE TABLE IF NOT EXISTS brand_responsibilities (
			brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			responsibility_type TEXT NOT NULL DEFAULT 'bd'
				CHECK (responsibility_type IN ('bd', 'mkt', 'graphic')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (brand_id, user_id)
		);
		ALTER TABLE brand_responsibilities
			ALTER COLUMN brand_id SET NOT NULL,
			ALTER COLUMN user_id SET NOT NULL;
		ALTER TABLE brand_responsibilities
			ADD COLUMN IF NOT EXISTS responsibility_type TEXT;
		UPDATE brand_responsibilities
			SET responsibility_type = 'bd'
			WHERE responsibility_type IS NULL;
		ALTER TABLE brand_responsibilities
			ALTER COLUMN responsibility_type SET NOT NULL;
		ALTER TABLE brand_responsibilities
			DROP CONSTRAINT IF EXISTS brand_responsibilities_responsibility_type_check;
		ALTER TABLE brand_responsibilities
			ADD CONSTRAINT brand_responsibilities_responsibility_type_check
			CHECK (responsibility_type IN ('bd', 'mkt', 'graphic'));
		CREATE INDEX IF NOT EXISTS idx_brand_responsibilities_user_id
			ON brand_responsibilities(user_id);
		ALTER TABLE brand_responsibilities ENABLE ROW LEVEL SECURITY;
		DO $brand_responsibility_security$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
				REVOKE ALL ON TABLE brand_responsibilities FROM anon;
			END IF;
			IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
				REVOKE ALL ON TABLE brand_responsibilities FROM authenticated;
			END IF;
		END
		$brand_responsibility_security$;
	`)

	// ลบงานและคอร์สงานในถังขยะที่อายุเกิน 30 วันทันทีตอนสตาร์ทระบบ
	_, err = db.Exec(`
		DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
		DELETE FROM task_lists WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
	`)
	if err != nil {
		fmt.Printf("[DB Init] ล้างถังขยะงานและคอร์สงานล้มเหลว: %v\n", err)
	}

	// เริ่ม background worker คอยเคลียร์ทุกๆ 24 ชั่วโมง
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			_, err := db.Exec(`
				DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
				DELETE FROM task_lists WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
			`)
			if err != nil {
				log.Printf("[Cleanup Worker] ล้างงานและคอร์สงานเก่าล้มเหลว: %v", err)
			}
		}
	}()

	return db, nil
}

func databaseURLWithPublicSearchPath(databaseURL string) (string, error) {
	parsed, err := url.Parse(databaseURL)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("options", "-c search_path=public")
	parsed.RawQuery = strings.ReplaceAll(query.Encode(), "+", "%20")
	return parsed.String(), nil
}
