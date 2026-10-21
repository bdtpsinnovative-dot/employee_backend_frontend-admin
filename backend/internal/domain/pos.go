package domain

import (
	"encoding/json"
	"time"
)

// --- POS Models ---

type ProductBranchStock struct {
	BranchID    int    `json:"branch_id"`
	BranchName  string `json:"branch_name"`
	Qty         int    `json:"qty"`
	IsOwnBranch bool   `json:"is_own_branch"`
}

type PosBranchInfo struct {
	ID   int    `json:"id"`
	Name string `json:"branch_name"`
}

type PosProduct struct {
	ID             int64                `json:"id"`
	Name           string               `json:"name"`
	Sku            string               `json:"sku"`
	Barcode        string               `json:"barcode"`
	OriginalPrice  float64              `json:"original_price"`
	Price          float64              `json:"price"`
	DiscountLabel  string               `json:"discount_label,omitempty"`
	DiscountID     *int64               `json:"discount_id,omitempty"`
	DiscountName   *string              `json:"discount_name,omitempty"`
	ImageURL       *string              `json:"image_url"`
	ProductSup     string               `json:"product_sup"`
	AvailableQty   int                  `json:"available_qty"`
	OwnBranchQty   int                  `json:"own_branch_qty"`
	OtherBranchQty int                  `json:"other_branch_qty"`
	TotalStock     int                  `json:"total_stock"`
	IsFurniture    bool                 `json:"is_furniture,omitempty"`
	IsExternal     bool                 `json:"is_external,omitempty"`
	Stocks         []ProductBranchStock `json:"stocks"`
}

type CreateCustomProductInput struct {
	Name          string  `json:"name"`
	Price         float64 `json:"price"`
	SKU           string  `json:"sku"`
	CategoryLabel string  `json:"category_label"`
	Unit          string  `json:"unit"`
	Note          string  `json:"note"`
	BranchID      int     `json:"branch_id"`
}

type PosCatalogResponse struct {
	Success    bool         `json:"success"`
	Products   []PosProduct `json:"products"`
	Categories []string     `json:"categories"`
	Branches   []PosBranchInfo `json:"branches"`
	BranchID   int          `json:"branch_id"`
	BranchName string       `json:"branch_name"`
}

type PosCouponInfo struct {
	ID             interface{} `json:"id"`
	Code           string      `json:"code"`
	Title          string      `json:"title"`
	DiscountType   string      `json:"discount_type"`
	DiscountValue  float64     `json:"discount_value"`
	DiscountAmount float64     `json:"discount_amount"`
	Source         string      `json:"source"`
}

type CartItemInput struct {
	ProductID       int64 `json:"product_id"`
	Quantity        int   `json:"quantity"`
	FulfillBranchID int   `json:"fulfill_branch_id"`
}

type CheckoutInput struct {
	CustomerName           string          `json:"customer_name"`
	CustomerPhone          string          `json:"customer_phone"`
	CustomerAddress        string          `json:"customer_address"`
	CompanyName            string          `json:"company_name"`
	TaxID                  string          `json:"tax_id"`
	SaleMode               string          `json:"sale_mode"`
	PaymentMethod          string          `json:"payment_method"`
	CouponCode             string          `json:"coupon_code"`
	SpecialDiscountBaht    float64         `json:"special_discount_baht"`
	SpecialDiscountPercent float64         `json:"special_discount_percent"`
	Items                  []CartItemInput `json:"items"`
}

type CheckoutResult struct {
	Success        bool    `json:"success"`
	OrderCode      string  `json:"order_code"`
	OrderID        int64   `json:"order_id"`
	Subtotal       float64 `json:"subtotal"`
	DiscountAmount float64 `json:"discount_amount"`
	TotalAmount    float64 `json:"total_amount"`
	VatAmount      float64 `json:"vat_amount"`
	Status         string  `json:"status"`
	SaleMode       string  `json:"sale_mode"`
	PaymentMethod  string  `json:"payment_method"`
}

type QuoteInput struct {
	CustomerName    string          `json:"customer_name"`
	CustomerPhone   string          `json:"customer_phone"`
	CustomerAddress string          `json:"customer_address"`
	CompanyName     string          `json:"company_name"`
	TaxID           string          `json:"tax_id"`
	Items           []CartItemInput `json:"items"`
}

type QuoteResult struct {
	Success   bool   `json:"success"`
	OrderCode string `json:"order_code"`
	Status    string `json:"status"`
}

// --- Dispatch Models ---

type DispatchProductInfo struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	Sku        string  `json:"sku"`
	ImageURL   *string `json:"image_url"`
	Price      float64 `json:"price"`
	ProductSup *string `json:"product_sup"`
	Material   *string `json:"material"`
	SizeStr    *string `json:"size_str"`
}

type DispatchOrderItemInfo struct {
	ID                int64               `json:"id"`
	Qty               int                 `json:"qty"`
	ItemStatus        string              `json:"item_status"`
	PriceAtSale       float64             `json:"price_at_sale"`
	FulfillBranchID   int                 `json:"fulfill_branch_id"`
	FulfillBranchName string              `json:"fulfill_branch_name"`
	IsCrossBranch     bool                `json:"is_cross_branch"`
	AvailableStock    int                 `json:"available_stock"`
	Product           DispatchProductInfo `json:"product"`
}

type DispatchOrderInfo struct {
	ID              int64                   `json:"id"`
	OrderCode       string                  `json:"order_code"`
	CreatedAt       string                  `json:"created_at"`
	ShippingName    string                  `json:"shipping_name"`
	ShippingPhone   string                  `json:"shipping_phone"`
	ShippingAddress string                  `json:"shipping_address"`
	Latitude        *float64                `json:"latitude"`
	Longitude       *float64                `json:"longitude"`
	Status          string                  `json:"status"`
	TotalAmount     float64                 `json:"total_amount"`
	DiscountAmount  float64                 `json:"discount_amount"`
	IsTakeaway      bool                    `json:"is_takeaway"`
	Items           []DispatchOrderItemInfo `json:"items"`
}

type DispatchCountsInfo struct {
	Overview        int `json:"overview"`
	MyTasks         int `json:"myTasks"`
	FollowUps       int `json:"followUps"`
	Completed       int `json:"completed"`
	Cancelled       int `json:"cancelled"`
	PendingApproval int `json:"pendingApproval"`
}

type GroupedDispatchesData struct {
	OverviewTasks        []DispatchOrderInfo `json:"overviewTasks"`
	MyTasks              []DispatchOrderInfo `json:"myTasks"`
	FollowUpTasks        []DispatchOrderInfo `json:"followUpTasks"`
	CompletedTasks       []DispatchOrderInfo `json:"completedTasks"`
	CancelledTasks       []DispatchOrderInfo `json:"cancelledTasks"`
	PendingApprovalTasks []DispatchOrderInfo `json:"pendingApprovalTasks"`
	Counts               DispatchCountsInfo  `json:"counts"`
}

type ApproveDispatchInput struct {
	OrderID         int64  `json:"order_id"`
	CustomOrderCode string `json:"custom_order_code"`
}

type ShipDispatchInput struct {
	OrderID int64   `json:"order_id"`
	ItemIDs []int64 `json:"item_ids"`
}

type CancelDispatchInput struct {
	OrderID int64  `json:"order_id"`
	Reason  string `json:"reason"`
}

type UpdateCustomerInput struct {
	OrderID         int64    `json:"order_id"`
	ShippingName    *string  `json:"shipping_name"`
	ShippingPhone   *string  `json:"shipping_phone"`
	ShippingAddress *string  `json:"shipping_address"`
	Latitude        *float64 `json:"latitude"`
	Longitude       *float64 `json:"longitude"`
}

// Ensure unused import warning prevention if needed
var _ = time.Now
var _ = json.Marshal
