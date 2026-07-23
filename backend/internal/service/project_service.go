package service

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
)

type ProjectService struct {
	repo *repository.ProjectRepo
}

func NewProjectService(repo *repository.ProjectRepo) *ProjectService {
	return &ProjectService{repo: repo}
}

func (s *ProjectService) CreateProject(ctx context.Context, p *domain.Project) error {
	return s.repo.CreateProject(ctx, p)
}

func (s *ProjectService) GetProjectByID(ctx context.Context, id uuid.UUID) (*domain.Project, error) {
	return s.repo.GetProjectByID(ctx, id)
}

func (s *ProjectService) ListProjects(ctx context.Context, userID *uuid.UUID, isAdmin bool) ([]domain.Project, error) {
	return s.repo.ListProjects(ctx, userID, isAdmin)
}

func (s *ProjectService) UpdateProject(ctx context.Context, p *domain.Project) error {
	return s.repo.UpdateProject(ctx, p)
}

func (s *ProjectService) DeleteProject(ctx context.Context, id uuid.UUID) error {
	return s.repo.DeleteProject(ctx, id)
}

func (s *ProjectService) AddProjectMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return s.repo.AddProjectMember(ctx, projectID, userID)
}

func (s *ProjectService) RemoveProjectMember(ctx context.Context, projectID, userID uuid.UUID) error {
	return s.repo.RemoveProjectMember(ctx, projectID, userID)
}

func (s *ProjectService) ListProjectMembers(ctx context.Context, projectID uuid.UUID) ([]domain.User, error) {
	return s.repo.ListProjectMembers(ctx, projectID)
}
