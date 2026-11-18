package repository

import (
	"context"
	"fmt"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// ShippingScheduleRepo manages SQL queries for public.shipping_schedules and public.branches.
type ShippingScheduleRepo struct {
	db *sqlx.DB
}

func NewShippingScheduleRepo(db *sqlx.DB) *ShippingScheduleRepo {
	return &ShippingScheduleRepo{db: db}
}

const shippingScheduleSelectCols = `
	id,
	TO_CHAR(delivery_date, 'YYYY-MM-DD') AS delivery_date,
	time_slot,
	title,
	branch_id,
	brand_id,
	customer_name,
	customer_phone,
	location,
	map_url,
	order_no,
	vehicle_type,
	driver_name,
	assignee_id,
	status,
	notes,
	created_by,
	updated_by,
	created_at,
	updated_at
`

// EnsureTable creates public.shipping_schedules, branch_id column, and indexes idempotently on server startup.
func (r *ShippingScheduleRepo) EnsureTable(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS public.shipping_schedules (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			delivery_date DATE NOT NULL,
			time_slot TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL,
			branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL,
			brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
			customer_name TEXT NOT NULL DEFAULT '',
			customer_phone TEXT NOT NULL DEFAULT '',
			location TEXT NOT NULL DEFAULT '',
			map_url TEXT NOT NULL DEFAULT '',
			order_no TEXT NOT NULL DEFAULT '',
			vehicle_type TEXT NOT NULL DEFAULT 'company_truck'
				CHECK (vehicle_type IN ('company_truck', 'lalamove', 'external_courier', 'customer_pickup', 'other')),
			driver_name TEXT NOT NULL DEFAULT '',
			assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
			status TEXT NOT NULL DEFAULT 'pending'
				CHECK (status IN ('pending', 'in_transit', 'delivered', 'postponed', 'cancelled')),
			notes TEXT NOT NULL DEFAULT '',
			created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
			updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		ALTER TABLE public.shipping_schedules
			ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL;
		CREATE INDEX IF NOT EXISTS idx_shipping_schedules_delivery_date
			ON public.shipping_schedules (delivery_date);
		CREATE INDEX IF NOT EXISTS idx_shipping_schedules_branch_id
			ON public.shipping_schedules (branch_id);
		CREATE INDEX IF NOT EXISTS idx_shipping_schedules_brand_id
			ON public.shipping_schedules (brand_id);
		CREATE INDEX IF NOT EXISTS idx_shipping_schedules_status
			ON public.shipping_schedules (status);
	`)
	return err
}

// ListBranches returns all branches from public.branches ordered by id ASC.
func (r *ShippingScheduleRepo) ListBranches(ctx context.Context) ([]domain.ShippingBranch, error) {
	var branches []domain.ShippingBranch
	err := r.db.SelectContext(ctx, &branches, `
		SELECT
			id,
			COALESCE(branch_code, '') AS branch_code,
			COALESCE(branch_name, '') AS branch_name,
			COALESCE(branch_type, 'SHOWROOM') AS branch_type
		FROM public.branches
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	if branches == nil {
		branches = []domain.ShippingBranch{}
	}
	return branches, nil
}

// ListByYear returns shipping schedules spanning Dec (year-1) through Feb (year+1) for smooth calendar navigation.
func (r *ShippingScheduleRepo) ListByYear(ctx context.Context, year int) ([]domain.ShippingSchedule, error) {
	startDate := fmt.Sprintf("%04d-12-01", year-1)
	endDate := fmt.Sprintf("%04d-02-28", year+1)

	var items []domain.ShippingSchedule
	query := fmt.Sprintf(`
		SELECT %s
		FROM public.shipping_schedules
		WHERE delivery_date >= $1::date AND delivery_date <= $2::date
		ORDER BY delivery_date ASC, time_slot ASC, created_at ASC
	`, shippingScheduleSelectCols)

	if err := r.db.SelectContext(ctx, &items, query, startDate, endDate); err != nil {
		return nil, err
	}
	if items == nil {
		items = []domain.ShippingSchedule{}
	}
	return items, nil
}

// GetByID fetches one shipping schedule by ID.
func (r *ShippingScheduleRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.ShippingSchedule, error) {
	var item domain.ShippingSchedule
	query := fmt.Sprintf(`
		SELECT %s
		FROM public.shipping_schedules
		WHERE id = $1
	`, shippingScheduleSelectCols)

	if err := r.db.GetContext(ctx, &item, query, id); err != nil {
		return nil, err
	}
	return &item, nil
}

// Create inserts a new shipping schedule and returns the created record.
func (r *ShippingScheduleRepo) Create(ctx context.Context, item *domain.ShippingSchedule) (*domain.ShippingSchedule, error) {
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}

	var created domain.ShippingSchedule
	query := fmt.Sprintf(`
		INSERT INTO public.shipping_schedules (
			id, delivery_date, time_slot, title, branch_id, brand_id,
			customer_name, customer_phone, location, map_url, order_no,
			vehicle_type, driver_name, assignee_id, status, notes,
			created_by, updated_by
		) VALUES (
			$1, $2::date, $3, $4, $5, $6,
			$7, $8, $9, $10, $11,
			$12, $13, $14, $15, $16,
			$17, $18
		)
		RETURNING %s
	`, shippingScheduleSelectCols)

	err := r.db.GetContext(
		ctx,
		&created,
		query,
		item.ID,
		item.DeliveryDate,
		item.TimeSlot,
		item.Title,
		item.BranchID,
		item.BrandID,
		item.CustomerName,
		item.CustomerPhone,
		item.Location,
		item.MapURL,
		item.OrderNo,
		item.VehicleType,
		item.DriverName,
		item.AssigneeID,
		item.Status,
		item.Notes,
		item.CreatedBy,
		item.UpdatedBy,
	)
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// Update replaces mutable fields on an existing shipping schedule and returns the updated record.
func (r *ShippingScheduleRepo) Update(ctx context.Context, item *domain.ShippingSchedule) (*domain.ShippingSchedule, error) {
	var updated domain.ShippingSchedule
	query := fmt.Sprintf(`
		UPDATE public.shipping_schedules
		SET
			delivery_date = $2::date,
			time_slot = $3,
			title = $4,
			branch_id = $5,
			brand_id = $6,
			customer_name = $7,
			customer_phone = $8,
			location = $9,
			map_url = $10,
			order_no = $11,
			vehicle_type = $12,
			driver_name = $13,
			assignee_id = $14,
			status = $15,
			notes = $16,
			updated_by = $17,
			updated_at = NOW()
		WHERE id = $1
		RETURNING %s
	`, shippingScheduleSelectCols)

	err := r.db.GetContext(
		ctx,
		&updated,
		query,
		item.ID,
		item.DeliveryDate,
		item.TimeSlot,
		item.Title,
		item.BranchID,
		item.BrandID,
		item.CustomerName,
		item.CustomerPhone,
		item.Location,
		item.MapURL,
		item.OrderNo,
		item.VehicleType,
		item.DriverName,
		item.AssigneeID,
		item.Status,
		item.Notes,
		item.UpdatedBy,
	)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

// Delete removes a shipping schedule by ID.
func (r *ShippingScheduleRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM public.shipping_schedules WHERE id = $1`, id)
	return err
}
