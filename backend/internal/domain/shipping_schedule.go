package domain

import (
	"time"

	"github.com/google/uuid"
)

// ShippingBranch represents a branch row from public.branches.
type ShippingBranch struct {
	ID         int64  `db:"id" json:"id"`
	BranchCode string `db:"branch_code" json:"branch_code"`
	BranchName string `db:"branch_name" json:"branch_name"`
	BranchType string `db:"branch_type" json:"branch_type"`
}

// ShippingSchedule represents a delivery/logistics schedule entry on the Shipping Plan Calendar.
// Maps to: public.shipping_schedules
type ShippingSchedule struct {
	ID            uuid.UUID  `db:"id" json:"id"`
	DeliveryDate  string     `db:"delivery_date" json:"delivery_date"`
	TimeSlot      string     `db:"time_slot" json:"time_slot"`
	Title         string     `db:"title" json:"title"`
	BranchID      *int64     `db:"branch_id" json:"branch_id"`
	BrandID       *uuid.UUID `db:"brand_id" json:"brand_id"`
	CustomerName  string     `db:"customer_name" json:"customer_name"`
	CustomerPhone string     `db:"customer_phone" json:"customer_phone"`
	Location      string     `db:"location" json:"location"`
	MapURL        string     `db:"map_url" json:"map_url"`
	OrderNo       string     `db:"order_no" json:"order_no"`
	VehicleType   string     `db:"vehicle_type" json:"vehicle_type"`
	DriverName    string     `db:"driver_name" json:"driver_name"`
	AssigneeID    *uuid.UUID `db:"assignee_id" json:"assignee_id"`
	Status        string     `db:"status" json:"status"`
	Notes         string     `db:"notes" json:"notes"`
	CreatedBy     *uuid.UUID `db:"created_by" json:"created_by"`
	UpdatedBy     *uuid.UUID `db:"updated_by" json:"updated_by"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time  `db:"updated_at" json:"updated_at"`
}
