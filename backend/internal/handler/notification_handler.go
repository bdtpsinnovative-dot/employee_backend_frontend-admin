package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
)

// NotificationHandler รับ HTTP Request สำหรับ notifications
type NotificationHandler struct {
	notifSvc *service.NotificationService
}

func NewNotificationHandler(notifSvc *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifSvc: notifSvc}
}

// GetMyNotifications GET /api/notifications
// ดึงรายการ notifications ทั้งหมดของผู้ใช้ที่ล็อกอินอยู่
func (h *NotificationHandler) GetMyNotifications(c *gin.Context) {
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	notifications, err := h.notifSvc.ListByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลแจ้งเตือนล้มเหลว"})
		return
	}

	// คืนค่า array เสมอ (ไม่คืน null)
	if notifications == nil {
		notifications = make([]domain.Notification, 0)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": notifications})
}

// MarkRead PATCH /api/notifications/:id/read
// mark notification เดียวว่าอ่านแล้ว
func (h *NotificationHandler) MarkRead(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID แจ้งเตือนไม่ถูกต้อง"})
		return
	}

	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	if err := h.notifSvc.MarkRead(c.Request.Context(), id, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะแจ้งเตือนล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อ่านแจ้งเตือนแล้ว"})
}

// MarkAllRead PATCH /api/notifications/read-all
// mark ทุก notification ของ user ว่าอ่านแล้ว
func (h *NotificationHandler) MarkAllRead(c *gin.Context) {
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	if err := h.notifSvc.MarkAllRead(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะแจ้งเตือนล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อ่านทั้งหมดแล้ว"})
}
