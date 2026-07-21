package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/Nattamon123/employee/backend/internal/service"
)

type SettingHandler struct {
	svc *service.SettingService
}

func NewSettingHandler(svc *service.SettingService) *SettingHandler {
	return &SettingHandler{svc: svc}
}

type updateCheckInModeBody struct {
	Mode string `json:"checkin_mode" binding:"required"` // "face" | "selfie"
}

// GetCheckInMode GET /api/settings/checkin-mode
func (h *SettingHandler) GetCheckInMode(c *gin.Context) {
	mode, err := h.svc.GetCheckInMode(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลการตั้งค่าล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "checkin_mode": mode})
}

// SetCheckInMode PUT /admin/settings/checkin-mode
func (h *SettingHandler) SetCheckInMode(c *gin.Context) {
	var body updateCheckInModeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุโหมดเช็คอิน (face/selfie)"})
		return
	}

	if body.Mode != "face" && body.Mode != "selfie" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "โหมดเช็คอินไม่ถูกต้อง ต้องเป็น face หรือ selfie เท่านั้น"})
		return
	}

	if err := h.svc.SetCheckInMode(c.Request.Context(), body.Mode); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกการตั้งค่าล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตโหมดการลงเวลาสำเร็จ"})
}
