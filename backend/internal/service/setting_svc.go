package service

import (
	"context"
	"errors"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
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
		return "selfie", nil // fallback default
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
	teamRecords, err := s.repo.ListTeams(ctx)
	if err != nil {
		return nil, err
	}
	teams := make([]string, 0, len(teamRecords))
	for _, team := range teamRecords {
		teams = append(teams, team.Name)
	}
	return teams, nil
}

func (s *SettingService) GetTeams(ctx context.Context) ([]domain.Team, error) {
	return s.repo.ListTeams(ctx)
}

func (s *SettingService) CreateTeam(ctx context.Context, name, shortName string) (domain.Team, error) {
	name = strings.TrimSpace(name)
	shortName = strings.TrimSpace(shortName)
	if name == "" || shortName == "" {
		return domain.Team{}, errors.New("กรุณาระบุชื่อทีมและชื่อย่อทีม")
	}
	if len([]rune(name)) > 80 || len([]rune(shortName)) > 20 {
		return domain.Team{}, errors.New("ชื่อทีมยาวเกินกำหนด")
	}
	return s.repo.CreateTeam(ctx, name, shortName)
}

func (s *SettingService) GetPositions(ctx context.Context, teamID *uuid.UUID) ([]domain.Position, error) {
	return s.repo.ListPositions(ctx, teamID)
}

func (s *SettingService) CreatePosition(ctx context.Context, teamID uuid.UUID, name string) (domain.Position, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return domain.Position{}, errors.New("กรุณาระบุชื่อตำแหน่ง")
	}
	if len([]rune(name)) > 80 {
		return domain.Position{}, errors.New("ชื่อตำแหน่งยาวเกินกำหนด")
	}
	return s.repo.CreatePosition(ctx, teamID, name)
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

	if _, err := s.repo.CreateTeam(ctx, name, name); err != nil {
		return nil, err
	}
	return s.GetProfileTeams(ctx)
}

func containsFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(value, target) {
			return true
		}
	}
	return false
}
