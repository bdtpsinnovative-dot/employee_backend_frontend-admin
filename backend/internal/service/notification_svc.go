package service

import (
	"context"
	"log"

	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

// NotificationService จัดการการสร้าง, ดึง, และอัปเดตสถานะ notification
type NotificationService struct {
	repo        *repository.NotificationRepo
	firebaseSvc *FirebaseService
	userRepo    *repository.UserRepo
}

func NewNotificationService(
	repo *repository.NotificationRepo,
	userRepo *repository.UserRepo,
	firebaseSvc *FirebaseService,
) *NotificationService {
	return &NotificationService{
		repo:        repo,
		firebaseSvc: firebaseSvc,
		userRepo:    userRepo,
	}
}

// Notify บันทึก notification ลง DB และส่ง push notification ผ่าน Firebase พร้อมกัน
// nType: "leave" | "attendance" | "system" | "announcement"
func (s *NotificationService) Notify(ctx context.Context, userID uuid.UUID, title, body, nType string) {
	n := &domain.Notification{
		ID:     uuid.New(),
		UserID: userID,
		Title:  title,
		Body:   body,
		Type:   nType,
	}

	// บันทึกลง DB
	if err := s.repo.Create(ctx, n); err != nil {
		log.Printf("[NotificationService] DB insert failed for user %s: %v", userID, err)
	}

	// ส่ง Push Notification แบบ async (ไม่ block)
	if s.firebaseSvc != nil && s.userRepo != nil {
		go func() {
			user, err := s.userRepo.FindByID(context.Background(), userID)
			if err != nil || user == nil || user.FcmToken == nil || *user.FcmToken == "" {
				return
			}
			if err := s.firebaseSvc.SendNotification(context.Background(), *user.FcmToken, title, body); err != nil {
				log.Printf("[NotificationService] Push failed for user %s: %v", userID, err)
			}
		}()
	}
}

// ListByUser ดึง notifications ทั้งหมดของ user
func (s *NotificationService) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Notification, error) {
	return s.repo.ListByUserID(ctx, userID)
}

// MarkRead mark notification เดียวว่าอ่านแล้ว
func (s *NotificationService) MarkRead(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	return s.repo.MarkRead(ctx, id, userID)
}

// MarkAllRead mark ทุก notification ของ user ว่าอ่านแล้ว
func (s *NotificationService) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	return s.repo.MarkAllRead(ctx, userID)
}
