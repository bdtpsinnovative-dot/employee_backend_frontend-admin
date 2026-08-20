package service

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
)

// LocationService จัดการเกี่ยวกับจุดทำงาน (Geofence)
type LocationService struct {
	repo *repository.LocationRepo
}

func NewLocationService(repo *repository.LocationRepo) *LocationService {
	return &LocationService{repo: repo}
}

// ListActive ดึงจุดทำงานทั้งหมดที่ยังใช้งานอยู่
func (s *LocationService) ListActive(ctx context.Context) ([]domain.WorkLocation, error) {
	return s.repo.ListActive(ctx)
}

// Create เพิ่มจุดทำงานใหม่
func (s *LocationService) Create(ctx context.Context, loc *domain.WorkLocation) error {
	loc.ID = uuid.New()
	loc.IsActive = true
	return s.repo.Create(ctx, loc)
}

func (s *LocationService) Update(ctx context.Context, loc *domain.WorkLocation) error {
	return s.repo.Update(ctx, loc)
}

// Delete ลบจุดทำงาน
func (s *LocationService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.repo.Delete(ctx, id)
}
