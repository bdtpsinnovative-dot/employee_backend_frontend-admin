package domain

import "github.com/google/uuid"

// PIRecord is a purchase and sales record exposed to HR Studio in read-only mode.
type PIRecord struct {
	ID            uuid.UUID `db:"id" json:"id"`
	PISupplier    string    `db:"pi_supplier" json:"pi_supplier"`
	RecordDate    string    `db:"record_date" json:"record_date"`
	Supplier      string    `db:"supplier" json:"supplier"`
	LinkFile      string    `db:"link_file" json:"link_file"`
	LinkFileURL   string    `db:"link_file_url" json:"link_file_url"`
	ETD           string    `db:"etd" json:"etd"`
	Brand         string    `db:"brand" json:"brand"`
	OrderNo       string    `db:"order_no" json:"order_no"`
	FileName      string    `db:"file_name" json:"file_name"`
	FileURL       string    `db:"file_url" json:"file_url"`
	SaleName      string    `db:"sale_name" json:"sale_name"`
	ProjectName   string    `db:"project_name" json:"project_name"`
	PaymentDate   string    `db:"payment_date" json:"payment_date"`
	DeliveredDate string    `db:"delivered_date" json:"delivered_date"`
	DateOrder     string    `db:"date_order" json:"date_order"`
}
