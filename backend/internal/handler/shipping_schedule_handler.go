package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ShippingScheduleHandler handles CRUD HTTP endpoints for the Shipping Plan Calendar.
// Accessible to all authenticated active users (admin & employee).
type ShippingScheduleHandler struct {
	repo *repository.ShippingScheduleRepo
}

func NewShippingScheduleHandler(repo *repository.ShippingScheduleRepo) *ShippingScheduleHandler {
	return &ShippingScheduleHandler{repo: repo}
}

var validShippingStatuses = map[string]bool{
	"pending":    true,
	"in_transit": true,
	"delivered":  true,
	"postponed":  true,
	"cancelled":  true,
}

var validShippingVehicles = map[string]bool{
	"company_truck":    true,
	"lalamove":         true,
	"external_courier": true,
	"customer_pickup":  true,
	"other":            true,
}

// optionalInt64 distinguishes between omitted field, explicit null/empty (clear), and integer value.
type optionalInt64 struct {
	Set   bool
	Value *int64
}

func (o *optionalInt64) UnmarshalJSON(data []byte) error {
	o.Set = true
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" || trimmed == `""` {
		o.Value = nil
		return nil
	}
	var num int64
	if err := json.Unmarshal(data, &num); err == nil {
		if num <= 0 {
			o.Value = nil
			return nil
		}
		o.Value = &num
		return nil
	}
	var str string
	if err := json.Unmarshal(data, &str); err == nil {
		str = strings.TrimSpace(str)
		if str == "" {
			o.Value = nil
			return nil
		}
		parsed, err := strconv.ParseInt(str, 10, 64)
		if err != nil {
			return err
		}
		o.Value = &parsed
		return nil
	}
	return errors.New("invalid branch_id")
}

type shippingScheduleBody struct {
	DeliveryDate  *string       `json:"delivery_date"`
	TimeSlot      *string       `json:"time_slot"`
	Title         *string       `json:"title"`
	BranchID      optionalInt64 `json:"branch_id"`
	BrandID       *string       `json:"brand_id"`
	CustomerName  *string       `json:"customer_name"`
	CustomerPhone *string       `json:"customer_phone"`
	Location      *string       `json:"location"`
	MapURL        *string       `json:"map_url"`
	OrderNo       *string       `json:"order_no"`
	VehicleType   *string       `json:"vehicle_type"`
	DriverName    *string       `json:"driver_name"`
	AssigneeID    *string       `json:"assignee_id"`
	Status        *string       `json:"status"`
	Notes         *string       `json:"notes"`
}

func parseOptionalUUID(raw *string) (*uuid.UUID, error) {
	if raw == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil, nil
	}
	parsed, err := uuid.Parse(trimmed)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func getActorUserID(c *gin.Context) *uuid.UUID {
	if val, ok := c.Get(middleware.ContextKeyUserID); ok {
		if uid, ok := val.(uuid.UUID); ok && uid != uuid.Nil {
			return &uid
		}
	}
	return nil
}

// ListBranches GET /api/shipping-schedules/branches
func (h *ShippingScheduleHandler) ListBranches(c *gin.Context) {
	branches, err := h.repo.ListBranches(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถโหลดรายชื่อสาขาได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": branches})
}

// List GET /api/shipping-schedules?year=2026
func (h *ShippingScheduleHandler) List(c *gin.Context) {
	yearStr := c.DefaultQuery("year", strconv.Itoa(time.Now().Year()))
	year, err := strconv.Atoi(yearStr)
	if err != nil || year < 2000 || year > 2100 {
		year = time.Now().Year()
	}

	items, err := h.repo.ListByYear(c.Request.Context(), year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถโหลดข้อมูลแผนขนส่งได้"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": items})
}

// Create POST /api/shipping-schedules
func (h *ShippingScheduleHandler) Create(c *gin.Context) {
	var body shippingScheduleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
		return
	}

	if body.DeliveryDate == nil || strings.TrimSpace(*body.DeliveryDate) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุวันที่จัดส่ง"})
		return
	}
	dateStr := strings.TrimSpace(*body.DeliveryDate)
	if _, err := parseDate(dateStr); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่จัดส่งต้องเป็น YYYY-MM-DD"})
		return
	}

	if body.Title == nil || strings.TrimSpace(*body.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุรายการสินค้าหรือหัวข้องานขนส่ง"})
		return
	}

	brandID, err := parseOptionalUUID(body.BrandID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสแบรนด์ไม่ถูกต้อง"})
		return
	}
	assigneeID, err := parseOptionalUUID(body.AssigneeID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสผู้ประสานงานไม่ถูกต้อง"})
		return
	}

	status := "pending"
	if body.Status != nil && strings.TrimSpace(*body.Status) != "" {
		s := strings.TrimSpace(*body.Status)
		if !validShippingStatuses[s] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะงานขนส่งไม่ถูกต้อง"})
			return
		}
		status = s
	}

	vehicleType := "company_truck"
	if body.VehicleType != nil && strings.TrimSpace(*body.VehicleType) != "" {
		v := strings.TrimSpace(*body.VehicleType)
		if !validShippingVehicles[v] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ประเภทการขนส่งไม่ถูกต้อง"})
			return
		}
		vehicleType = v
	}

	actorID := getActorUserID(c)
	trimStr := func(p *string) string {
		if p == nil {
			return ""
		}
		return strings.TrimSpace(*p)
	}

	item := &domain.ShippingSchedule{
		DeliveryDate:  dateStr,
		TimeSlot:      trimStr(body.TimeSlot),
		Title:         trimStr(body.Title),
		BranchID:      body.BranchID.Value,
		BrandID:       brandID,
		CustomerName:  trimStr(body.CustomerName),
		CustomerPhone: trimStr(body.CustomerPhone),
		Location:      trimStr(body.Location),
		MapURL:        trimStr(body.MapURL),
		OrderNo:       trimStr(body.OrderNo),
		VehicleType:   vehicleType,
		DriverName:    trimStr(body.DriverName),
		AssigneeID:    assigneeID,
		Status:        status,
		Notes:         trimStr(body.Notes),
		CreatedBy:     actorID,
		UpdatedBy:     actorID,
	}

	created, err := h.repo.Create(c.Request.Context(), item)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มแผนขนส่งไม่สำเร็จ"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": created})
}

// Update PUT /api/shipping-schedules/:id
func (h *ShippingScheduleHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสคิวขนส่งไม่ถูกต้อง"})
		return
	}

	existing, err := h.repo.GetByID(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบคิวขนส่งนี้"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถอ่านข้อมูลคิวขนส่งได้"})
		return
	}

	var body shippingScheduleBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบข้อมูลไม่ถูกต้อง"})
		return
	}

	if body.DeliveryDate != nil {
		dateStr := strings.TrimSpace(*body.DeliveryDate)
		if _, err := parseDate(dateStr); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่จัดส่งต้องเป็น YYYY-MM-DD"})
			return
		}
		existing.DeliveryDate = dateStr
	}
	if body.TimeSlot != nil {
		existing.TimeSlot = strings.TrimSpace(*body.TimeSlot)
	}
	if body.Title != nil {
		t := strings.TrimSpace(*body.Title)
		if t == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุรายการสินค้าหรือหัวข้องานขนส่ง"})
			return
		}
		existing.Title = t
	}
	if body.BranchID.Set {
		existing.BranchID = body.BranchID.Value
	}
	if body.BrandID != nil {
		bid, err := parseOptionalUUID(body.BrandID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสแบรนด์ไม่ถูกต้อง"})
			return
		}
		existing.BrandID = bid
	}
	if body.CustomerName != nil {
		existing.CustomerName = strings.TrimSpace(*body.CustomerName)
	}
	if body.CustomerPhone != nil {
		existing.CustomerPhone = strings.TrimSpace(*body.CustomerPhone)
	}
	if body.Location != nil {
		existing.Location = strings.TrimSpace(*body.Location)
	}
	if body.MapURL != nil {
		existing.MapURL = strings.TrimSpace(*body.MapURL)
	}
	if body.OrderNo != nil {
		existing.OrderNo = strings.TrimSpace(*body.OrderNo)
	}
	if body.VehicleType != nil {
		v := strings.TrimSpace(*body.VehicleType)
		if !validShippingVehicles[v] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ประเภทการขนส่งไม่ถูกต้อง"})
			return
		}
		existing.VehicleType = v
	}
	if body.DriverName != nil {
		existing.DriverName = strings.TrimSpace(*body.DriverName)
	}
	if body.AssigneeID != nil {
		aid, err := parseOptionalUUID(body.AssigneeID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสผู้ประสานงานไม่ถูกต้อง"})
			return
		}
		existing.AssigneeID = aid
	}
	if body.Status != nil {
		s := strings.TrimSpace(*body.Status)
		if !validShippingStatuses[s] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะงานขนส่งไม่ถูกต้อง"})
			return
		}
		existing.Status = s
	}
	if body.Notes != nil {
		existing.Notes = strings.TrimSpace(*body.Notes)
	}

	existing.UpdatedBy = getActorUserID(c)

	updated, err := h.repo.Update(c.Request.Context(), existing)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "แก้ไขคิวขนส่งไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": updated})
}

// Delete DELETE /api/shipping-schedules/:id
func (h *ShippingScheduleHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสคิวขนส่งไม่ถูกต้อง"})
		return
	}

	if err := h.repo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบคิวขนส่งไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
