package repository

import (
	"context"
	"fmt"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type ProjectRepo struct {
	db *sqlx.DB
}

func NewProjectRepo(db *sqlx.DB) *ProjectRepo {
	return &ProjectRepo{db: db}
}

// CreateProject creates a new project
func (r *ProjectRepo) CreateProject(ctx context.Context, p *domain.Project) error {
	query := `
		INSERT INTO public.projects (name, description, brand_id, owner_id, start_date, due_date, status, progress, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		p.Name, p.Description, p.BrandID, p.OwnerID, p.StartDate, p.DueDate, p.Status, p.Progress, p.SortOrder,
	).Scan(&p.ID, &p.CreatedAt, &p.UpdatedAt)
	
	if err != nil {
		return fmt.Errorf("CreateProject error: %w", err)
	}

	// Auto-add owner to project members
	if p.OwnerID != nil {
		_ = r.AddProjectMember(ctx, p.ID, *p.OwnerID)
	}

	return nil
}

// GetProjectByID retrieves a project by its ID
func (r *ProjectRepo) GetProjectByID(ctx context.Context, id uuid.UUID) (*domain.Project, error) {
	query := `SELECT * FROM public.projects WHERE id = $1`
	var p domain.Project
	if err := r.db.GetContext(ctx, &p, query, id); err != nil {
		return nil, err
	}
	return &p, nil
}

// ListProjects retrieves all projects (filtered by user_id if provided)
func (r *ProjectRepo) ListProjects(ctx context.Context, userID *uuid.UUID, isAdmin bool) ([]domain.Project, error) {
	var projects []domain.Project
	
	if isAdmin || userID == nil {
		query := `SELECT * FROM public.projects ORDER BY sort_order ASC, created_at DESC`
		if err := r.db.SelectContext(ctx, &projects, query); err != nil {
			return nil, err
		}
	} else {
		query := `
			SELECT p.* FROM public.projects p
			LEFT JOIN public.project_members pm ON p.id = pm.project_id
			WHERE p.owner_id = $1 OR pm.user_id = $1
			GROUP BY p.id
			ORDER BY p.sort_order ASC, p.created_at DESC
		`
		if err := r.db.SelectContext(ctx, &projects, query, *userID); err != nil {
			return nil, err
		}
	}
	return projects, nil
}

// UpdateProject updates an existing project
func (r *ProjectRepo) UpdateProject(ctx context.Context, p *domain.Project) error {
	query := `
		UPDATE public.projects
		SET name = $1, description = $2, brand_id = $3, start_date = $4, due_date = $5, status = $6, progress = $7, sort_order = $8, updated_at = NOW()
		WHERE id = $9
	`
	_, err := r.db.ExecContext(ctx, query,
		p.Name, p.Description, p.BrandID, p.StartDate, p.DueDate, p.Status, p.Progress, p.SortOrder, p.ID,
	)
	return err
}

// DeleteProject deletes a project
func (r *ProjectRepo) DeleteProject(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM public.projects WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}

// AddProjectMember adds a user to a project
func (r *ProjectRepo) AddProjectMember(ctx context.Context, projectID, userID uuid.UUID) error {
	query := `
		INSERT INTO public.project_members (project_id, user_id)
		VALUES ($1, $2)
		ON CONFLICT (project_id, user_id) DO NOTHING
	`
	_, err := r.db.ExecContext(ctx, query, projectID, userID)
	return err
}

// RemoveProjectMember removes a user from a project
func (r *ProjectRepo) RemoveProjectMember(ctx context.Context, projectID, userID uuid.UUID) error {
	query := `DELETE FROM public.project_members WHERE project_id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query, projectID, userID)
	return err
}

// ListProjectMembers lists all members of a project
func (r *ProjectRepo) ListProjectMembers(ctx context.Context, projectID uuid.UUID) ([]domain.User, error) {
	query := `
		SELECT u.* FROM public.users u
		JOIN public.project_members pm ON u.id = pm.user_id
		WHERE pm.project_id = $1
	`
	var users []domain.User
	if err := r.db.SelectContext(ctx, &users, query, projectID); err != nil {
		return nil, err
	}
	return users, nil
}
