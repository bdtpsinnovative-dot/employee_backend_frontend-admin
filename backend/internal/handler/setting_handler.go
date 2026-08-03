package handler

import (
	"net/http"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
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

// GetProfileTeams GET /admin/settings/profile-teams
func (h *SettingHandler) GetProfileTeams(c *gin.Context) {
	teams, err := h.svc.GetProfileTeams(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงรายชื่อทีมไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": teams})
}

// GetTeams GET /admin/settings/teams
func (h *SettingHandler) GetTeams(c *gin.Context) {
	teams, err := h.svc.GetTeams(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลทีมไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": teams})
}

type addProfileTeamBody struct {
	Name string `json:"name" binding:"required"`
}

// AddProfileTeam POST /admin/settings/profile-teams
func (h *SettingHandler) AddProfileTeam(c *gin.Context) {
	var body addProfileTeamBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุชื่อทีม"})
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" || len([]rune(name)) > 50 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อทีมต้องมี 1-50 ตัวอักษร"})
		return
	}

	teams, err := h.svc.AddProfileTeam(c.Request.Context(), name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มทีมไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": teams})
}
