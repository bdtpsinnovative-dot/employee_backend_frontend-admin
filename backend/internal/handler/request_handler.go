package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
)

// LeaveHandler รับ HTTP Request เกี่ยวกับใบลา
type LeaveHandler struct {
	svc *service.LeaveService
}

func NewLeaveHandler(svc *service.LeaveService) *LeaveHandler {
	return &LeaveHandler{svc: svc}
}

type createLeaveBody struct {
	Date           string  `json:"date" binding:"required"`       // วันที่ลา (YYYY-MM-DD)
	LeaveType      string  `json:"leave_type" binding:"required"` // ลาป่วย, ลากิจ, สลับวันหยุด, ทำงานวันหยุด
	Duration       string  `json:"duration"`                       // เต็มวัน, ครึ่งวันเช้า, ครึ่งวันบ่าย
	SwapDate       *string `json:"swap_date"`                      // วันที่ทำงานชดเชย (สำหรับสลับวันหยุด)
	Reason         string  `json:"reason"`
	MedicalCertURL *string `json:"medical_cert_url"`               // URL ใบรับรองแพทย์
}

// Create POST /api/leaves — ส่งใบลา
func (h *LeaveHandler) Create(c *gin.Context) {
	var body createLeaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)
	date, err := parseDate(body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง"})
		return
	}

	req := &domain.LeaveRequest{
		UserID:         userID.(uuid.UUID),
		Date:           date,
		LeaveType:      body.LeaveType,
		Duration:       body.Duration,
		Reason:         body.Reason,
		MedicalCertURL: body.MedicalCertURL,
	}

	// จัดการวันชดเชย (ถ้ามี)
	if body.SwapDate != nil {
		sd, err := parseDate(*body.SwapDate)
		if err == nil {
			req.SwapDate = &sd
		}
	}

	if err := h.svc.Create(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ส่งใบลาล้มเหลว"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "message": "ส่งใบลาเรียบร้อย รอแอดมินอนุมัติ"})
}

// ListMine GET /api/leaves — ดูใบลาของตัวเอง
func (h *LeaveHandler) ListMine(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)

	requests, err := h.svc.ListMine(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": requests})
}

// GetMyQuota GET /api/leaves/quota?year=2026
func (h *LeaveHandler) GetMyQuota(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	year, _, err := parseYearMonth(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปีไม่ถูกต้อง"})
		return
	}

	balances, err := h.svc.GetLeaveBalances(c.Request.Context(), userID.(uuid.UUID), year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลสิทธิวันลาล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": balances})
}

// GetUserQuota GET /admin/users/:id/quota?year=2026
func (h *LeaveHandler) GetUserQuota(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}
	
	year, _, err := parseYearMonth(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปีไม่ถูกต้อง"})
		return
	}

	quota, err := h.svc.GetUserQuota(c.Request.Context(), userID, year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลโควต้าล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": quota})
}

type updateUserQuotaBody struct {
	SickLeave     int `json:"sick_leave"`
	PersonalLeave int `json:"personal_leave"`
	AnnualLeave   int `json:"annual_leave"`
}

// UpdateUserQuota PUT /admin/users/:id/quota?year=2026
func (h *LeaveHandler) UpdateUserQuota(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}
	
	year, _, err := parseYearMonth(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปีไม่ถูกต้อง"})
		return
	}

	var body updateUserQuotaBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	quota := &domain.LeaveQuota{
		UserID:        userID,
		Year:          year,
		SickLeave:     body.SickLeave,
		PersonalLeave: body.PersonalLeave,
		AnnualLeave:   body.AnnualLeave,
	}

	if err := h.svc.UpdateUserQuota(c.Request.Context(), quota); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกโควต้าล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตโควต้าสำเร็จ"})
}

// OffsiteHandler รับ HTTP Request เกี่ยวกับคำขอออกหน้างาน
type OffsiteHandler struct {
	svc *service.OffsiteService
}

func NewOffsiteHandler(svc *service.OffsiteService) *OffsiteHandler {
	return &OffsiteHandler{svc: svc}
}

type createOffsiteBody struct {
	Date   string `json:"date" binding:"required"`   // วันที่ออกหน้างาน (YYYY-MM-DD)
	Reason string `json:"reason" binding:"required"` // เหตุผล
}

// Create POST /api/offsite — ส่งคำขอออกหน้างาน
func (h *OffsiteHandler) Create(c *gin.Context) {
	var body createOffsiteBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)
	date, err := parseDate(body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง"})
		return
	}

	req := &domain.OffsiteRequest{
		UserID: userID.(uuid.UUID),
		Date:   date,
		Reason: body.Reason,
	}

	if err := h.svc.Create(c.Request.Context(), req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ส่งคำขอล้มเหลว"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "message": "ส่งคำขอออกหน้างานเรียบร้อย รอแอดมินอนุมัติ"})
}

// ListMine GET /api/offsite — ดูคำขอของตัวเอง
func (h *OffsiteHandler) ListMine(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)

	requests, err := h.svc.ListMine(c.Request.Context(), userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": requests})
}

// HolidayHandler รับ HTTP Request เกี่ยวกับวันหยุด
type HolidayHandler struct {
	svc *service.HolidayService
}

func NewHolidayHandler(svc *service.HolidayService) *HolidayHandler {
	return &HolidayHandler{svc: svc}
}

// List GET /api/holidays?year=2026 — ดูวันหยุดทั้งปี
func (h *HolidayHandler) List(c *gin.Context) {
	year, _, err := parseYearMonth(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ปีไม่ถูกต้อง"})
		return
	}

	holidays, err := h.svc.ListByYear(c.Request.Context(), year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลวันหยุดล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": holidays})
}

type createHolidayBody struct {
	Date    string `json:"date" binding:"required"`
	Name    string `json:"name" binding:"required"`
	NumDays int    `json:"num_days"`
}

// Create POST /admin/holidays — เพิ่มวันหยุด (Admin)
func (h *HolidayHandler) Create(c *gin.Context) {
	var body createHolidayBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	date, err := parseDate(body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง"})
		return
	}

	numDays := body.NumDays
	if numDays < 1 {
		numDays = 1
	}

	hol := &domain.Holiday{
		Date:    date,
		Name:    body.Name,
		NumDays: numDays,
	}

	if err := h.svc.Create(c.Request.Context(), hol); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มวันหยุดล้มเหลว"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "message": "เพิ่มวันหยุดสำเร็จ"})
}

// Delete DELETE /admin/holidays/:id — ลบวันหยุด (Admin)
func (h *HolidayHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	if err := h.svc.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบวันหยุดล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบวันหยุดสำเร็จ"})
}
