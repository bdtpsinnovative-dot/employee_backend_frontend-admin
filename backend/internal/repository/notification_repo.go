package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

type NotificationRepo struct {
	db *sqlx.DB
}

func NewNotificationRepo(db *sqlx.DB) *NotificationRepo {
	return &NotificationRepo{db: db}
}

// Create บันทึก notification ใหม่ลงฐานข้อมูล
func (r *NotificationRepo) Create(ctx context.Context, n *domain.Notification) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO notifications (id, user_id, title, body, type, is_read, created_at)
		VALUES ($1, $2, $3, $4, $5, false, NOW())
	`, n.ID, n.UserID, n.Title, n.Body, n.Type)
	return err
}

// ListByUserID ดึง notifications ทั้งหมดของ user เรียงจากใหม่สุด (max 100)
func (r *NotificationRepo) ListByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Notification, error) {
	var notifications []domain.Notification
	err := r.db.SelectContext(ctx, &notifications, `
		SELECT id, user_id, title, body, type, is_read, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 100
	`, userID)
	if err != nil {
		return nil, err
	}
	return notifications, nil
}

// MarkRead mark notification เดียวว่าอ่านแล้ว (ตรวจ user_id เพื่อป้องกัน IDOR)
func (r *NotificationRepo) MarkRead(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE notifications SET is_read = true
		WHERE id = $1 AND user_id = $2
	`, id, userID)
	return err
}

// MarkAllRead mark ทุก notification ของ user ว่าอ่านแล้ว
func (r *NotificationRepo) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE notifications SET is_read = true
		WHERE user_id = $1 AND is_read = false
	`, userID)
	return err
}
