package handler

import (
	"log"
	"net/http"
	"strings"
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
	listRepo    *repository.TaskListRepo
	cardRepo    *repository.TaskCardRepo
}

func NewTaskHandler(taskSvc *service.TaskService, subItemRepo *repository.TaskSubItemRepo, eventRepo *repository.TaskEventRepo, listRepo *repository.TaskListRepo, cardRepo *repository.TaskCardRepo) *TaskHandler {
	return &TaskHandler{taskSvc: taskSvc, subItemRepo: subItemRepo, eventRepo: eventRepo, listRepo: listRepo, cardRepo: cardRepo}
}

func (h *TaskHandler) audit(c *gin.Context, scope *repository.TaskEventScope, action, content string, taskID *uuid.UUID) {
	if h.eventRepo != nil {
		if err := recordTaskEvent(c, h.eventRepo, scope, action, content, taskID); err != nil {
			log.Printf("task audit write failed (%s): %v", action, err)
		}
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
	ListNames   []string `json:"list_names"`
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
		u, err := uuid.Parse(idStr)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้รับผิดชอบไม่ถูกต้อง"})
			return
		}
		assigneeUUIDs = append(assigneeUUIDs, u)
	}
	if len(assigneeUUIDs) == 0 && req.AssignedTo != "" {
		u, err := uuid.Parse(req.AssignedTo)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้รับผิดชอบไม่ถูกต้อง"})
			return
		}
		assigneeUUIDs = append(assigneeUUIDs, u)
	}

	if len(assigneeUUIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน"})
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Description = strings.TrimSpace(req.Description)
	if req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่องาน"})
		return
	}
	listNames := make([]string, 0, len(req.ListNames))
	for _, name := range req.ListNames {
		if trimmed := strings.TrimSpace(name); trimmed != "" {
			listNames = append(listNames, trimmed)
		}
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

	task, err := h.taskSvc.CreateTask(c.Request.Context(), assigneeUUIDs, req.Title, req.Description, &dueDate, adminUserID, brandID, categoryID, nil, nil, listNames)
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

// UpdateTask PATCH /api/tasks/:id
func (h *TaskHandler) UpdateTask(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req createTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือใส่ข้อมูลไม่ครบ"})
		return
	}

	assigneeUUIDs := make([]uuid.UUID, 0, len(req.AssigneeIDs))
	for _, idStr := range req.AssigneeIDs {
		parsed, parseErr := uuid.Parse(idStr)
		if parseErr != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้รับผิดชอบไม่ถูกต้อง"})
			return
		}
		assigneeUUIDs = append(assigneeUUIDs, parsed)
	}
	if len(assigneeUUIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ต้องเลือกผู้รับผิดชอบอย่างน้อย 1 คน"})
		return
	}

	dueDate, err := time.Parse("2006-01-02", req.DueDate)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่กำหนดส่งไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)"})
		return
	}

	var brandID *uuid.UUID
	if req.BrandID != "" {
		if parsed, parseErr := uuid.Parse(req.BrandID); parseErr == nil {
			brandID = &parsed
		}
	}
	var categoryID *uuid.UUID
	if req.CategoryID != "" {
		if parsed, parseErr := uuid.Parse(req.CategoryID); parseErr == nil {
			categoryID = &parsed
		}
	}

	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)
	roleRaw, _ := c.Get(middleware.ContextKeyRole)
	isAdmin := roleRaw.(string) == "admin"

	existingTask, _ := h.taskSvc.GetTask(c.Request.Context(), id)

	task, err := h.taskSvc.UpdateTask(
		c.Request.Context(),
		id,
		assigneeUUIDs,
		req.Title,
		req.Description,
		&dueDate,
		userID,
		isAdmin,
		brandID,
		categoryID,
	)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	if existingTask != nil {
		if req.Title != existingTask.Title {
			h.audit(c, nil, "task_updated", "เปลี่ยนชื่องานจาก \""+existingTask.Title+"\" เป็น \""+req.Title+"\"", &id)
		}
		if req.Description != existingTask.Description {
			h.audit(c, nil, "task_updated", "แก้ไขรายละเอียดงาน", &id)
		}
		if req.DueDate != "" {
			oldDue := ""
			if existingTask.DueDate != nil {
				oldDue = existingTask.DueDate.Format("2006-01-02")
			}
			if req.DueDate != oldDue {
				h.audit(c, nil, "task_updated", "เปลี่ยนวันครบกำหนดงานจาก \""+oldDue+"\" เป็น \""+req.DueDate+"\"", &id)
			}
		}
		// Check if assignees changed (simple length check + set compare)
		oldIDs := make(map[uuid.UUID]bool)
		for _, aid := range existingTask.AssigneeIDs {
			oldIDs[aid] = true
		}
		var added, removed []string
		for _, uid := range assigneeUUIDs {
			if !oldIDs[uid] {
				added = append(added, uid.String())
			}
		}
		newIDSet := make(map[uuid.UUID]bool)
		for _, uid := range assigneeUUIDs {
			newIDSet[uid] = true
		}
		for _, uid := range existingTask.AssigneeIDs {
			if !newIDSet[uid] {
				removed = append(removed, uid.String())
			}
		}
		if len(added) > 0 {
			h.audit(c, nil, "task_updated", "เพิ่มผู้รับผิดชอบงาน", &id)
		}
		if len(removed) > 0 {
			h.audit(c, nil, "task_updated", "นำผู้รับผิดชอบงานออก", &id)
		}
	} else {
		h.audit(c, nil, "task_updated", "แก้ไขรายละเอียดงาน: "+req.Title, &id)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": task})
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
