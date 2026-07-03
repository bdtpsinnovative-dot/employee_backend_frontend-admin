package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
)

// AdminHandler รับ HTTP Request สำหรับแอดมิน (จัดการพนักงาน, อนุมัติคำขอ)
type AdminHandler struct {
	userSvc       *service.UserService
	leaveSvc      *service.LeaveService
	offsiteSvc    *service.OffsiteService
	attendanceSvc *service.AttendanceService
	locationSvc   *service.LocationService
}

func NewAdminHandler(
	us *service.UserService,
	ls *service.LeaveService,
	os *service.OffsiteService,
	as *service.AttendanceService,
	locS *service.LocationService,
) *AdminHandler {
	return &AdminHandler{
		userSvc:       us,
		leaveSvc:      ls,
		offsiteSvc:    os,
		attendanceSvc: as,
		locationSvc:   locS,
	}
}

// ListUsers GET /admin/users — ดูรายชื่อพนักงานทั้งหมด
func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.userSvc.ListAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลพนักงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": users})
}

// ApproveUser PATCH /admin/users/:id/approve — อนุมัติบัญชีพนักงาน
func (h *AdminHandler) ApproveUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	if err := h.userSvc.ApproveUser(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อนุมัติบัญชีล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อนุมัติบัญชีสำเร็จ"})
}

// DisableUser PATCH /admin/users/:id/disable — ปิดบัญชีพนักงาน
func (h *AdminHandler) DisableUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	if err := h.userSvc.DisableUser(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ปิดบัญชีล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ปิดบัญชีสำเร็จ"})
}

// UnbindDevice PATCH /admin/users/:id/unbind-device — ปลดล็อคเครื่องมือถือ
func (h *AdminHandler) UnbindDevice(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	if err := h.userSvc.UnbindDevice(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ปลดล็อคเครื่องล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ปลดล็อคเครื่องสำเร็จ พนักงานสามารถล็อกอินเครื่องใหม่ได้"})
}

// updateStatusBody ข้อมูลที่ส่งมาตอนอนุมัติ/ปฏิเสธคำขอ
type updateStatusBody struct {
	Status string `json:"status" binding:"required"` // "approved" หรือ "rejected"
}

// GetPendingRequests GET /admin/requests/pending — ดูคำขอที่รออนุมัติ (ทั้งใบลาและออกหน้างาน)
func (h *AdminHandler) GetPendingRequests(c *gin.Context) {
	leaves, _ := h.leaveSvc.ListPending(c.Request.Context())
	offsite, _ := h.offsiteSvc.ListPending(c.Request.Context())

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"data": gin.H{
			"leaves":  leaves,
			"offsite": offsite,
		},
	})
}

// GetAllRequests GET /admin/requests/all — ดูคำขอทั้งหมดทุกสถานะ (สำหรับหน้าประวัติย้อนหลัง)
func (h *AdminHandler) GetAllRequests(c *gin.Context) {
	leaves, _ := h.leaveSvc.ListAll(c.Request.Context())
	offsite, _ := h.offsiteSvc.ListAll(c.Request.Context())

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"data": gin.H{
			"leaves":  leaves,
			"offsite": offsite,
		},
	})
}

// UpdateLeaveStatus PATCH /admin/leaves/:id/status — อนุมัติ/ปฏิเสธใบลา
func (h *AdminHandler) UpdateLeaveStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	var body updateStatusBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุสถานะ (approved/rejected)"})
		return
	}

	adminID, _ := c.Get(middleware.ContextKeyUserID)
	if err := h.leaveSvc.UpdateStatus(c.Request.Context(), id, body.Status, adminID.(uuid.UUID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะใบลาสำเร็จ"})
}

// UpdateOffsiteStatus PATCH /admin/offsite/:id/status — อนุมัติ/ปฏิเสธคำขอออกหน้างาน
func (h *AdminHandler) UpdateOffsiteStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	var body updateStatusBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุสถานะ (approved/rejected)"})
		return
	}

	adminID, _ := c.Get(middleware.ContextKeyUserID)
	if err := h.offsiteSvc.UpdateStatus(c.Request.Context(), id, body.Status, adminID.(uuid.UUID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะคำขอออกหน้างานสำเร็จ"})
}

// GetUserHistory GET /admin/users/:id/history — ดึงประวัติเข้างานและใบลาทั้งหมดของพนักงาน (สำหรับโหมดรายบุคคล)
func (h *AdminHandler) GetUserHistory(c *gin.Context) {
	userID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	attendance, err := h.attendanceSvc.ListByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติเข้างานล้มเหลว"})
		return
	}

	leaves, err := h.leaveSvc.ListMine(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติการลาล้มเหลว"})
		return
	}

	offsite, err := h.offsiteSvc.ListMine(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติออกหน้างานล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"data": gin.H{
			"attendance": attendance,
			"leaves":     leaves,
			"offsite":    offsite,
		},
	})
}

// GetAllAttendance GET /admin/attendance?date=2026-07-02 — ดูสถิติเข้างานทุกคน
func (h *AdminHandler) GetAllAttendance(c *gin.Context) {
	dateStr := c.DefaultQuery("date", "")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุวันที่ ?date=2026-07-02"})
		return
	}

	date, err := parseDate(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง"})
		return
	}

	records, err := h.attendanceSvc.GetAllByDate(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลสถิติเข้างานล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": records})
}

type manualAttendanceBody struct {
	UserID string `json:"user_id" binding:"required"`
	Date   string `json:"date" binding:"required"`   // YYYY-MM-DD
	Status string `json:"status" binding:"required"` // on_time, late
}

// ManualAttendance POST /admin/attendance/manual — บันทึกเข้างานด้วยมือ (กรณีพิเศษ)
func (h *AdminHandler) ManualAttendance(c *gin.Context) {
	var body manualAttendanceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	userID, err := uuid.Parse(body.UserID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "UserID ไม่ถูกต้อง"})
		return
	}

	date, err := parseDate(body.Date)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง"})
		return
	}

	att, err := h.attendanceSvc.CreateManual(c.Request.Context(), userID, date, body.Status)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "บันทึกเข้างานสำเร็จ", "data": att})
}

// ListLocations GET /admin/locations — ดูจุดทำงานทั้งหมด
func (h *AdminHandler) ListLocations(c *gin.Context) {
	locations, err := h.locationSvc.ListActive(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลจุดทำงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": locations})
}

type createLocationBody struct {
	Name      string  `json:"name" binding:"required"`
	Latitude  float64 `json:"latitude" binding:"required"`
	Longitude float64 `json:"longitude" binding:"required"`
	RadiusM   int     `json:"radius_m"`
}

// CreateLocation POST /admin/locations — เพิ่มจุดทำงาน (สาขาใหม่)
func (h *AdminHandler) CreateLocation(c *gin.Context) {
	var body createLocationBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	radius := body.RadiusM
	if radius <= 0 {
		radius = 50 // default radius
	}

	loc := &domain.WorkLocation{
		Name:      body.Name,
		Latitude:  body.Latitude,
		Longitude: body.Longitude,
		RadiusM:   radius,
	}

	if err := h.locationSvc.Create(c.Request.Context(), loc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มจุดทำงานล้มเหลว"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "message": "เพิ่มจุดทำงานสำเร็จ", "data": loc})
}

// DeleteLocation DELETE /admin/locations/:id — ลบจุดทำงาน
func (h *AdminHandler) DeleteLocation(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไม่ถูกต้อง"})
		return
	}

	if err := h.locationSvc.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบจุดทำงานล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบจุดทำงานสำเร็จ"})
}
