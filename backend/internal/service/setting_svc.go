package service

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/repository"
)

type SettingService struct {
	repo *repository.SettingRepo
}

func NewSettingService(repo *repository.SettingRepo) *SettingService {
	return &SettingService{repo: repo}
}

// GetCheckInMode ดึงโหมดการเช็คอินปัจจุบัน ("face" หรือ "selfie")
func (s *SettingService) GetCheckInMode(ctx context.Context) (string, error) {
	mode, err := s.repo.Get(ctx, "checkin_mode")
	if err != nil {
		return "", err
	}
	if mode == "" {
		return "face", nil // fallback default
	}
	return mode, nil
}

// SetCheckInMode เปลี่ยนโหมดการเช็คอิน ("face" หรือ "selfie")
func (s *SettingService) SetCheckInMode(ctx context.Context, mode string) error {
	return s.repo.Upsert(ctx, "checkin_mode", mode)
}
