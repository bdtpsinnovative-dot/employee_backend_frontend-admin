package handler

import (
	"net/http"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
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

type createTeamBody struct {
	Name      string `json:"name" binding:"required"`
	ShortName string `json:"short_name" binding:"required"`
}

// CreateTeam POST /admin/settings/teams
func (h *SettingHandler) CreateTeam(c *gin.Context) {
	var body createTeamBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุชื่อทีมและชื่อย่อทีม"})
		return
	}
	team, err := h.svc.CreateTeam(c.Request.Context(), body.Name, body.ShortName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": team})
}

// GetPositions GET /admin/settings/positions?team_id=<uuid>
func (h *SettingHandler) GetPositions(c *gin.Context) {
	var teamID *uuid.UUID
	if raw := strings.TrimSpace(c.Query("team_id")); raw != "" {
		parsed, err := uuid.Parse(raw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "team_id ไม่ถูกต้อง"})
			return
		}
		teamID = &parsed
	}
	positions, err := h.svc.GetPositions(c.Request.Context(), teamID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลตำแหน่งไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": positions})
}

type createPositionBody struct {
	TeamID string `json:"team_id" binding:"required"`
	Name   string `json:"name" binding:"required"`
}

// CreatePosition POST /admin/settings/positions
func (h *SettingHandler) CreatePosition(c *gin.Context) {
	var body createPositionBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุทีมและชื่อตำแหน่ง"})
		return
	}
	teamID, err := uuid.Parse(strings.TrimSpace(body.TeamID))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "team_id ไม่ถูกต้อง"})
		return
	}
	position, err := h.svc.CreatePosition(c.Request.Context(), teamID, body.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": position})
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
