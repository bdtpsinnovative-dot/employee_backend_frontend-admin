package repository

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type ProjectGroupRepo struct {
	db *sqlx.DB
}

func NewProjectGroupRepo(db *sqlx.DB) *ProjectGroupRepo {
	return &ProjectGroupRepo{db: db}
}

// CreateGroup creates a new project group
func (r *ProjectGroupRepo) CreateGroup(ctx context.Context, g *domain.ProjectGroup) error {
	query := `
		INSERT INTO public.project_groups (project_id, name, description, sort_order)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query,
		g.ProjectID, g.Name, g.Description, g.SortOrder,
	).Scan(&g.ID, &g.CreatedAt)
}

// GetGroupByID retrieves a project group by its ID
func (r *ProjectGroupRepo) GetGroupByID(ctx context.Context, id uuid.UUID) (*domain.ProjectGroup, error) {
	query := `SELECT * FROM public.project_groups WHERE id = $1`
	var g domain.ProjectGroup
	if err := r.db.GetContext(ctx, &g, query, id); err != nil {
		return nil, err
	}
	return &g, nil
}

// ListGroupsByProjectID lists groups for a specific project
func (r *ProjectGroupRepo) ListGroupsByProjectID(ctx context.Context, projectID uuid.UUID) ([]domain.ProjectGroup, error) {
	query := `SELECT * FROM public.project_groups WHERE project_id = $1 ORDER BY sort_order ASC, created_at ASC`
	var groups []domain.ProjectGroup
	if err := r.db.SelectContext(ctx, &groups, query, projectID); err != nil {
		return nil, err
	}
	return groups, nil
}

// UpdateGroup updates a project group
func (r *ProjectGroupRepo) UpdateGroup(ctx context.Context, g *domain.ProjectGroup) error {
	query := `
		UPDATE public.project_groups
		SET name = $1, description = $2, sort_order = $3
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query, g.Name, g.Description, g.SortOrder, g.ID)
	return err
}

// DeleteGroup deletes a project group
func (r *ProjectGroupRepo) DeleteGroup(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM public.project_groups WHERE id = $1`
	_, err := r.db.ExecContext(ctx, query, id)
	return err
}
