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

	// สร้างตาราง tasks อัตโนมัติหากยังไม่มี (สำหรับระบบมอบหมายงาน) และเพิ่มฟีลด์ fcm_token
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			assigned_to   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			title         TEXT NOT NULL,
			description   TEXT NOT NULL DEFAULT '',
			due_date      DATE,
			status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
			assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
		CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
		
		ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token TEXT;
		ALTER TABLE task_cards ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE task_sub_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;
		ALTER TABLE card_attachments ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
	`)

	return db, nil
}
