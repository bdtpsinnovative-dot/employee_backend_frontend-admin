package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type BackupHandler struct {
	svc *service.BackupService
}

func NewBackupHandler(svc *service.BackupService) *BackupHandler {
	return &BackupHandler{svc: svc}
}

func (h *BackupHandler) List(c *gin.Context) {
	jobs, err := h.svc.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": jobs})
}

func (h *BackupHandler) Config(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"ok":              true,
		"restore_enabled": h.svc.RestoreEnabled(),
		"backup_enabled":  h.svc.BackupEnabled(),
		"tables":          h.svc.TableOptions(),
	})
}

func (h *BackupHandler) Create(c *gin.Context) {
	var body struct {
		Note string `json:"note"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุโน้ตของจุดเซฟ"})
		return
	}
	body.Note = strings.TrimSpace(body.Note)
	if body.Note == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุโน้ตของจุดเซฟ"})
		return
	}
	if len([]rune(body.Note)) > 200 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "โน้ตของจุดเซฟต้องไม่เกิน 200 ตัวอักษร"})
		return
	}

	adminID, ok := c.Get(middleware.ContextKeyUserID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูล Admin"})
		return
	}

	job, err := h.svc.StartBackup(c.Request.Context(), adminID.(uuid.UUID), body.Note)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"ok": true, "data": job})
}

func (h *BackupHandler) Restore(c *gin.Context) {
	var body struct {
		Tables []string `json:"tables"`
	}
	if c.Request.ContentLength != 0 {
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบตารางที่เลือกไม่ถูกต้อง"})
			return
		}
	}
	backupID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัส backup ไม่ถูกต้อง"})
		return
	}
	adminID, ok := c.Get(middleware.ContextKeyUserID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูล Admin"})
		return
	}

	job, err := h.svc.StartRestoreTables(c.Request.Context(), backupID, adminID.(uuid.UUID), body.Tables)
	if err != nil {
		h.writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"ok": true, "data": job})
}

func (h *BackupHandler) Get(c *gin.Context) {
	jobID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รหัสงาน backup ไม่ถูกต้อง"})
		return
	}
	job, err := h.svc.Get(c.Request.Context(), jobID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบงาน backup"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": job})
}

func (h *BackupHandler) writeServiceError(c *gin.Context, err error) {
	if errors.Is(err, service.ErrBackupInProgress) {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "backup_in_progress"})
		return
	}
	if errors.Is(err, service.ErrRestoreDisabled) || errors.Is(err, service.ErrBackupDisabled) {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
}
