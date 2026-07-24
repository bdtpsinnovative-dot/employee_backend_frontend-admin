package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/internal/service"
)

type TaskHandler struct {
	taskSvc     *service.TaskService
	subItemRepo *repository.TaskSubItemRepo
}

func NewTaskHandler(taskSvc *service.TaskService, subItemRepo *repository.TaskSubItemRepo) *TaskHandler {
	return &TaskHandler{taskSvc: taskSvc, subItemRepo: subItemRepo}
}

type createTaskReq struct {
	AssignedTo  string   `json:"assigned_to"`
	AssigneeIDs []string `json:"assignee_ids"`
	Title       string   `json:"title" binding:"required"`
	Description string   `json:"description"`
	DueDate     string   `json:"due_date"` // YYYY-MM-DD
	BrandID     string   `json:"brand_id"`
	CategoryID  string   `json:"category_id"`
	SubItems    []string `json:"sub_items"` // list of sub-item titles
}

// CreateTask POST /admin/tasks (Admin only)
func (h *TaskHandler) CreateTask(c *gin.Context) {
	var req createTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือใส่ข้อมูลไม่ครบ"})
		return
	}

	var assigneeUUIDs []uuid.UUID
	for _, idStr := range req.AssigneeIDs {
		if u, err := uuid.Parse(idStr); err == nil {
			assigneeUUIDs = append(assigneeUUIDs, u)
		}
	}
	if len(assigneeUUIDs) == 0 && req.AssignedTo != "" {
		if u, err := uuid.Parse(req.AssignedTo); err == nil {
			assigneeUUIDs = append(assigneeUUIDs, u)
		}
	}

	if len(assigneeUUIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน"})
		return
	}

	var dueDate time.Time
	var err error
	if req.DueDate != "" {
		dueDate, err = time.Parse("2006-01-02", req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่กำหนดส่งไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)"})
			return
		}
	} else {
		dueDate = time.Now().AddDate(0, 0, 7) // Default to 7 days from now
	}

	// Parse optional brand_id and category_id
	var brandID *uuid.UUID
	if req.BrandID != "" {
		parsed, err := uuid.Parse(req.BrandID)
		if err == nil {
			brandID = &parsed
		}
	}
	var categoryID *uuid.UUID
	if req.CategoryID != "" {
		parsed, err := uuid.Parse(req.CategoryID)
		if err == nil {
			categoryID = &parsed
		}
	}

	adminUserIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	adminUserID := adminUserIDRaw.(uuid.UUID)

	task, err := h.taskSvc.CreateTask(c.Request.Context(), assigneeUUIDs, req.Title, req.Description, &dueDate, adminUserID, brandID, categoryID, nil, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create sub-items if any
	if len(req.SubItems) > 0 && h.subItemRepo != nil {
		var subItems []domain.TaskSubItem
		for i, title := range req.SubItems {
			if title == "" {
				continue
			}
			subItems = append(subItems, domain.TaskSubItem{
				ID:        uuid.New(),
				TaskID:    task.ID,
				Title:     title,
				IsDone:    false,
				SortOrder: i,
				CreatedAt: time.Now(),
			})
		}
		if len(subItems) > 0 {
			_ = h.subItemRepo.CreateBatch(c.Request.Context(), subItems)
			task.SubItems = subItems
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": task})
}

// ListAllTasks GET /admin/tasks (Admin only)
func (h *TaskHandler) ListAllTasks(c *gin.Context) {
	tasks, err := h.taskSvc.ListAllTasks(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": tasks})
}

// DeleteTask DELETE /admin/tasks/:id (Admin only)
func (h *TaskHandler) DeleteTask(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	err = h.taskSvc.DeleteTask(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบงานล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบงานสำเร็จ"})
}

// ListMyTasks GET /api/tasks (Employee view)
func (h *TaskHandler) ListMyTasks(c *gin.Context) {
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	tasks, err := h.taskSvc.ListTasksByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลงานของพนักงานล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": tasks})
}

type updateTaskStatusReq struct {
	Status string `json:"status" binding:"required"`
}

// UpdateTaskStatus PATCH /api/tasks/:id/status (Employee updates status)
func (h *TaskHandler) UpdateTaskStatus(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req updateTaskStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลสถานะไม่ถูกต้อง"})
		return
	}

	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	roleRaw, _ := c.Get(middleware.ContextKeyRole)
	role := roleRaw.(string)
	isAdmin := role == "admin"

	err = h.taskSvc.UpdateTaskStatus(c.Request.Context(), id, req.Status, userID, isAdmin)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะงานสำเร็จ"})
}
