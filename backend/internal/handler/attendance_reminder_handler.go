package handler

import (
	"net/http"

	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
)

// AttendanceReminderHandler จัดการ HTTP request สำหรับทริกเกอร์แจ้งเตือนเช็คอินเข้างาน
type AttendanceReminderHandler struct {
	svc *service.AttendanceReminderService
}

func NewAttendanceReminderHandler(svc *service.AttendanceReminderService) *AttendanceReminderHandler {
	return &AttendanceReminderHandler{svc: svc}
}

// TriggerReminders ตรวจสอบและยิงแจ้งเตือนเช็คอินเข้างาน
// ใช้งานได้ทั้งจาก Background Worker และจาก External Cron (เช่น cron-job.org หรือ Render Cron)
func (h *AttendanceReminderHandler) TriggerReminders(c *gin.Context) {
	sentCount, err := h.svc.CheckAndSendReminders(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "Check-in reminder check completed successfully",
		"sent_count": sentCount,
	})
}
