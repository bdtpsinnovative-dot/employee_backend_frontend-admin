package handler

import (
	"log"
	"net/http"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TaskHandler struct {
	taskSvc     *service.TaskService
	subItemRepo *repository.TaskSubItemRepo
	eventRepo   *repository.TaskEventRepo
}

func NewTaskHandler(taskSvc *service.TaskService, subItemRepo *repository.TaskSubItemRepo, eventRepo *repository.TaskEventRepo) *TaskHandler {
	return &TaskHandler{taskSvc: taskSvc, subItemRepo: subItemRepo, eventRepo: eventRepo}
}

func (h *TaskHandler) audit(c *gin.Context, scope *repository.TaskEventScope, action, content string, taskID *uuid.UUID) {
	if err := recordTaskEvent(c, h.eventRepo, scope, action, content, taskID); err != nil {
		log.Printf("task audit write failed (%s): %v", action, err)
	}
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

	task, err := h.taskSvc.CreateTask(c.Request.Context(), assigneeUUIDs, req.Title, req.Description, dueDate, adminUserID, brandID, categoryID)
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

	h.audit(c, nil, "task_created", "สร้างงาน: "+task.Title, &task.ID)
	for i := range task.SubItems {
		item := &task.SubItems[i]
		scope := &repository.TaskEventScope{
			TaskID:    task.ID,
			SubItemID: &item.ID,
			Name:      item.Title,
		}
		h.audit(c, scope, "sub_item_created", "เพิ่มรายการย่อย: "+item.Title, nil)
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

	task, _ := h.taskSvc.GetTask(c.Request.Context(), id)
	err = h.taskSvc.DeleteTask(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบงานล้มเหลว"})
		return
	}
	title := id.String()
	if task != nil {
		title = task.Title
	}
	h.audit(c, nil, "task_deleted", "ลบงาน: "+title, &id)

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
	h.audit(c, nil, "task_status_changed", "เปลี่ยนสถานะงานเป็น: "+req.Status, &id)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะงานสำเร็จ"})
}

type updateTaskReq struct {
	Title       string      `json:"title"`
	Description string      `json:"description"`
	DueDate     string      `json:"due_date"`
	AssignedTo  *string     `json:"assigned_to"`
	AssigneeIDs []uuid.UUID `json:"assignee_ids"`
	BrandID     *string     `json:"brand_id"`
	CategoryID  *string     `json:"category_id"`
}

// UpdateTask PUT /api/tasks/:id
func (h *TaskHandler) UpdateTask(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req updateTaskReq
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	dueDate, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		t, err2 := time.Parse(time.RFC3339, req.DueDate)
		if err2 == nil {
			dueDate = t
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันกำหนดส่งไม่ถูกต้อง"})
			return
		}
	}

	var brandID *uuid.UUID
	if req.BrandID != nil && *req.BrandID != "" {
		u, err := uuid.Parse(*req.BrandID)
		if err == nil {
			brandID = &u
		}
	}

	var categoryID *uuid.UUID
	if req.CategoryID != nil && *req.CategoryID != "" {
		u, err := uuid.Parse(*req.CategoryID)
		if err == nil {
			categoryID = &u
		}
	}

	task, err := h.taskSvc.UpdateTask(c.Request.Context(), id, req.AssigneeIDs, req.Title, req.Description, dueDate, brandID, categoryID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.audit(c, nil, "task_updated", "แก้ไขข้อมูลงาน: "+task.Title, &task.ID)

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": task})
}

// ListTrashTasks GET /api/tasks/trash
func (h *TaskHandler) ListTrashTasks(c *gin.Context) {
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	roleRaw, _ := c.Get(middleware.ContextKeyRole)
	role := roleRaw.(string)
	isAdmin := role == "admin"

	tasks, err := h.taskSvc.ListTrashTasks(c.Request.Context(), userID, isAdmin)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลงานในถังขยะล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": tasks})
}

// RestoreTask POST /api/tasks/:id/restore
func (h *TaskHandler) RestoreTask(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	err = h.taskSvc.RestoreTask(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "กู้คืนงานล้มเหลว"})
		return
	}
	h.audit(c, nil, "task_restored", "กู้คืนงานจากถังขยะ", &id)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "กู้คืนงานสำเร็จ"})
}
