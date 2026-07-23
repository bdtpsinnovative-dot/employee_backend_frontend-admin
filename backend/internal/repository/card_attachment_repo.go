package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

// CardAttachmentRepo จัดการ SQL queries สำหรับตาราง card_attachments
type CardAttachmentRepo struct {
	db *sqlx.DB
}

func NewCardAttachmentRepo(db *sqlx.DB) *CardAttachmentRepo {
	return &CardAttachmentRepo{db: db}
}

// Create เพิ่ม Attachment ใหม่ในการ์ด
func (r *CardAttachmentRepo) Create(ctx context.Context, a *domain.CardAttachment) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO card_attachments (id, card_id, url, name, type, created_at, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, a.ID, a.CardID, a.URL, a.Name, a.Type, a.CreatedAt, a.CreatedBy)
	return err
}

// ListByCard ดึง Attachments ทั้งหมดของการ์ด
func (r *CardAttachmentRepo) ListByCard(ctx context.Context, cardID uuid.UUID) ([]domain.CardAttachment, error) {
	var attachments []domain.CardAttachment
	err := r.db.SelectContext(ctx, &attachments, `
		SELECT id, card_id, url, name, type, created_at, created_by
		FROM card_attachments
		WHERE card_id = $1
		ORDER BY created_at ASC
	`, cardID)
	if err != nil {
		return nil, err
	}
	return attachments, nil
}

// Delete ลบ Attachment
func (r *CardAttachmentRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM card_attachments WHERE id = $1`, id)
	return err
}

// EnsureTable รัน migration สร้างตาราง card_attachments ถ้ายังไม่มี
func (r *CardAttachmentRepo) EnsureTable(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS card_attachments (
			id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			card_id    UUID NOT NULL,
			url        TEXT NOT NULL,
			name       TEXT NOT NULL DEFAULT '',
			type       TEXT NOT NULL DEFAULT 'file' CHECK (type IN ('image', 'file', 'link')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_card_attachments_card_id ON card_attachments(card_id);
		ALTER TABLE card_attachments DROP CONSTRAINT IF EXISTS card_attachments_card_id_fkey;
	`)
	return err
}

// GetByIDAndCardID ดึง Attachment ด้วย ID และ CardID เพื่อตรวจสอบสิทธิ์
func (r *CardAttachmentRepo) GetCardID(ctx context.Context, attachmentID uuid.UUID) (uuid.UUID, error) {
	var cardID uuid.UUID
	err := r.db.GetContext(ctx, &cardID, `SELECT card_id FROM card_attachments WHERE id = $1`, attachmentID)
	return cardID, err
}
