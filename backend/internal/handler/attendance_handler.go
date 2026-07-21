package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
)

// AttendanceHandler รับ HTTP Request เกี่ยวกับการเข้า-ออกงาน
type AttendanceHandler struct {
	svc *service.AttendanceService
}

func NewAttendanceHandler(svc *service.AttendanceService) *AttendanceHandler {
	return &AttendanceHandler{svc: svc}
}

// checkInBody ข้อมูลที่แอปส่งมาตอนเช็คอิน
type checkInBody struct {
	Lat        float64   `json:"lat" binding:"required"`       // พิกัดละติจูด
	Lng        float64   `json:"lng" binding:"required"`       // พิกัดลองจิจูด
	DeviceID   string    `json:"device_id" binding:"required"` // UUID ของเครื่องมือถือ
	PhotoURL   *string   `json:"photo_url"`                    // URL รูปถ่าย (ถ้ามี)
	FaceVector []float64 `json:"face_vector" binding:"required"`
}

// CheckIn POST /api/attendance/checkin
// เช็คอินเข้างาน — ตรวจ GPS, คำนวณสาย, บันทึกเวลาของ Server
func (h *AttendanceHandler) CheckIn(c *gin.Context) {
	var body checkInBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ กรุณาตรวจสอบ GPS และการแสกนใบหน้า"})
		return
	}

	userID, _ := c.Get(middleware.ContextKeyUserID)

	faceVectorStr, err := formatFaceVector(body.FaceVector, false)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req := service.CheckInRequest{
		UserID:     userID.(uuid.UUID),
		Lat:        body.Lat,
		Lng:        body.Lng,
		PhotoURL:   body.PhotoURL,
		DeviceID:   body.DeviceID,
		FaceVector: faceVectorStr,
	}

	att, err := h.svc.CheckIn(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "เช็คอินสำเร็จ",
		"data":    att,
	})
}

// checkOutBody ข้อมูลที่แอปส่งมาตอนเช็คเอาท์
type checkOutBody struct {
	Lat      *float64 `json:"lat"`
	Lng      *float64 `json:"lng"`
	PhotoURL *string  `json:"photo_url"`
}

// CheckOut POST /api/attendance/checkout
// เช็คเอาท์ออกงาน
func (h *AttendanceHandler) CheckOut(c *gin.Context) {
	var body checkOutBody
	c.ShouldBindJSON(&body) // ไม่บังคับ (อาจไม่ส่ง GPS ตอนออก)

	userID, _ := c.Get(middleware.ContextKeyUserID)

	req := service.CheckOutRequest{
		UserID:   userID.(uuid.UUID),
		Lat:      body.Lat,
		Lng:      body.Lng,
		PhotoURL: body.PhotoURL,
	}

	att, err := h.svc.CheckOut(c.Request.Context(), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "เช็คเอาท์สำเร็จ",
		"data":    att,
	})
}

// GetByDate GET /api/attendance?date=2026-07-02
// ดูสถานะเข้างานของวันที่ระบุ
func (h *AttendanceHandler) GetByDate(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)
	dateStr := c.DefaultQuery("date", "")

	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุวันที่ ?date=2026-07-02"})
		return
	}

	date, err := parseDate(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD"})
		return
	}

	att, err := h.svc.GetByDate(c.Request.Context(), userID.(uuid.UUID), date)
	if err != nil {
		// ไม่มีบันทึก = ยังไม่เช็คอิน
		c.JSON(http.StatusOK, gin.H{"ok": true, "data": nil})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": att})
}

// History GET /api/attendance/history?year=2026&month=7
// ดูประวัติเข้างานทั้งเดือน
func (h *AttendanceHandler) History(c *gin.Context) {
	userID, _ := c.Get(middleware.ContextKeyUserID)

	year, month, err := parseYearMonth(c)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	records, err := h.svc.History(c.Request.Context(), userID.(uuid.UUID), year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงประวัติล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": records})
}

// GetSummary GET /api/attendance/summary?date=2026-07-02
func (h *AttendanceHandler) GetSummary(c *gin.Context) {
	dateStr := c.DefaultQuery("date", "")
	if dateStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุวันที่ ?date=2026-07-02"})
		return
	}

	date, err := parseDate(dateStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง ใช้ YYYY-MM-DD"})
		return
	}

	total, attended, late, err := h.svc.GetTodaySummary(c.Request.Context(), date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลสรุปล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok": true,
		"data": gin.H{
			"total_employees": total,
			"attended_today":  attended,
			"late_today":      late,
		},
	})
}
