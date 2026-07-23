package service

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
)

type ProjectGroupService struct {
	repo *repository.ProjectGroupRepo
}

func NewProjectGroupService(repo *repository.ProjectGroupRepo) *ProjectGroupService {
	return &ProjectGroupService{repo: repo}
}

func (s *ProjectGroupService) CreateGroup(ctx context.Context, g *domain.ProjectGroup) error {
	return s.repo.CreateGroup(ctx, g)
}

func (s *ProjectGroupService) GetGroupByID(ctx context.Context, id uuid.UUID) (*domain.ProjectGroup, error) {
	return s.repo.GetGroupByID(ctx, id)
}

func (s *ProjectGroupService) ListGroupsByProjectID(ctx context.Context, projectID uuid.UUID) ([]domain.ProjectGroup, error) {
	return s.repo.ListGroupsByProjectID(ctx, projectID)
}

func (s *ProjectGroupService) UpdateGroup(ctx context.Context, g *domain.ProjectGroup) error {
	return s.repo.UpdateGroup(ctx, g)
}

func (s *ProjectGroupService) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteGroup(ctx, id)
}
