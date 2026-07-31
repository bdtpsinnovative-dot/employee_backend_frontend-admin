package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/repository"
)

var defaultProfileTeams = []string{"BD", "Marketing", "Graphic"}

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

// GetProfileTeams returns the admin-managed team choices. The three default
// teams are always present even when the setting has not been saved yet.
func (s *SettingService) GetProfileTeams(ctx context.Context) ([]string, error) {
	raw, err := s.repo.Get(ctx, "profile_teams")
	if err != nil {
		return nil, err
	}

	teams := append([]string(nil), defaultProfileTeams...)
	if raw == "" {
		return teams, nil
	}

	var stored []string
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return nil, err
	}
	for _, team := range stored {
		team = strings.TrimSpace(team)
		if team != "" && !containsFold(teams, team) {
			teams = append(teams, team)
		}
	}
	return teams, nil
}

// AddProfileTeam appends a new team choice while preventing case-insensitive duplicates.
func (s *SettingService) AddProfileTeam(ctx context.Context, name string) ([]string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("กรุณาระบุชื่อทีม")
	}
	if len([]rune(name)) > 50 {
		return nil, errors.New("ชื่อทีมต้องไม่เกิน 50 ตัวอักษร")
	}

	teams, err := s.GetProfileTeams(ctx)
	if err != nil {
		return nil, err
	}
	if !containsFold(teams, name) {
		teams = append(teams, name)
	}

	encoded, err := json.Marshal(teams)
	if err != nil {
		return nil, err
	}
	if err := s.repo.Upsert(ctx, "profile_teams", string(encoded)); err != nil {
		return nil, err
	}
	return teams, nil
}

func containsFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}
