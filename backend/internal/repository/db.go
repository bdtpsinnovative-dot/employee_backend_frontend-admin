package repository

import (
	"fmt"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq" // PostgreSQL driver
)

// NewDB สร้าง connection pool ไปยัง Supabase PostgreSQL
func NewDB(databaseURL string) (*sqlx.DB, error) {
	db, err := sqlx.Connect("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถเชื่อมต่อฐานข้อมูลได้: %w", err)
	}

	// ตั้งค่า connection pool (จำกัดให้ไม่เกิน 8 เพื่อเลี่ยงลิมิต 15 ของ Supabase ใน session mode)
	db.SetMaxOpenConns(8)  // จำนวนการเชื่อมต่อสูงสุด
	db.SetMaxIdleConns(2)   // จำนวนการเชื่อมต่อที่เก็บไว้รอ
	
	// ทดสอบการเชื่อมต่อ
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ฐานข้อมูลไม่ตอบสนอง: %w", err)
	}

	// ตารางติดตาม schema migration
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT NOW()
		);
	`)
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถสร้าง schema_migrations ได้: %w", err)
	}

	// สร้างตารางพื้นฐานที่ไม่มีใน migration แยก (Legacy schema init)
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			assigned_to   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title         TEXT NOT NULL,
			description   TEXT NOT NULL DEFAULT '',
			due_date      DATE,
			status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'in_review')),
			assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
		CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
		
		ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';
		ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE task_attachments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
	`)
	if err != nil {
		return nil, fmt.Errorf("schema initialization ล้มเหลว: %w", err)
	}

	// ตรวจสอบว่า Migration 016 ถูกรันหรือยัง
	// โดยเราเพิ่ม check จาก schema_migrations, แต่เนื่องจาก 016 ก่อนหน้านี้ไม่ได้ insert ลง schema_migrations 
	// เราจะเช็ค fallback ว่ามี task_submissions table หรือไม่
	var hasMigration016 bool
	err = db.Get(&hasMigration016, `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_submissions')`)
	if err != nil {
		return nil, fmt.Errorf("ไม่สามารถตรวจสอบสถานะตาราง task_submissions ได้: %w", err)
	}
	if !hasMigration016 {
		return nil, fmt.Errorf("STARTUP ABORTED: Missing required schema migration '016_task_submissions'. Please run the migration script first.")
	}

	// บันทึกว่า 016 ผ่านแล้ว
	_, _ = db.Exec(`INSERT INTO schema_migrations (version) VALUES ('016_task_submissions') ON CONFLICT DO NOTHING`)

	return db, nil
}
