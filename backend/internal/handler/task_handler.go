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
	ProjectID   string   `json:"project_id"`
	GroupID     string   `json:"group_id"`
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

	var dueDatePtr *time.Time
	if req.DueDate != "" {
		dueDate, err := time.Parse("2006-01-02", req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่กำหนดส่งไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)"})
			return
		}
		dueDatePtr = &dueDate
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

	var projectID *uuid.UUID
	if req.ProjectID != "" {
		parsed, err := uuid.Parse(req.ProjectID)
		if err == nil {
			projectID = &parsed
		}
	}
	var groupID *uuid.UUID
	if req.GroupID != "" {
		parsed, err := uuid.Parse(req.GroupID)
		if err == nil {
			groupID = &parsed
		}
	}

	adminUserIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	adminUserID := adminUserIDRaw.(uuid.UUID)

	task, err := h.taskSvc.CreateTask(c.Request.Context(), assigneeUUIDs, req.Title, req.Description, dueDatePtr, adminUserID, brandID, categoryID, projectID, groupID)
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

type updateTaskReq struct {
	AssignedTo  string   `json:"assigned_to"`
	AssigneeIDs []string `json:"assignee_ids"`
	Title       string   `json:"title" binding:"required"`
	Description string   `json:"description"`
	DueDate     string   `json:"due_date"` // YYYY-MM-DD
	BrandID     string   `json:"brand_id"`
	CategoryID  string   `json:"category_id"`
	ProjectID   string   `json:"project_id"`
	GroupID     string   `json:"group_id"`
}

// UpdateTask PUT /api/tasks/:id
func (h *TaskHandler) UpdateTask(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ของงานไม่ถูกต้อง"})
		return
	}

	var req updateTaskReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้องหรือใส่ข้อมูลไม่ครบ"})
		return
	}

	var assigneeUUIDs []uuid.UUID
	for _, aID := range req.AssigneeIDs {
		if u, err := uuid.Parse(aID); err == nil {
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

	var dueDatePtr *time.Time
	if req.DueDate != "" {
		dueDate, err := time.Parse("2006-01-02", req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)"})
			return
		}
		dueDatePtr = &dueDate
	}

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

	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)
	
	roleRaw, _ := c.Get(middleware.ContextKeyRole)
	isAdmin := roleRaw.(string) == "admin"

	task, err := h.taskSvc.UpdateTask(c.Request.Context(), id, assigneeUUIDs, req.Title, req.Description, dueDatePtr, userID, isAdmin, brandID, categoryID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": task})
}

// ListAllTasks GET /admin/tasks (Admin only)
func (h *TaskHandler) ListAllTasks(c *gin.Context) {
	tasks, err := h.taskSvc.ListAllTasks(c.Request.Context())
	if err != nil {
		log.Printf("[ListAllTasks] Error querying tasks: %v", err)
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
func (h *TaskHandler) ListProjectTasks(c *gin.Context) {
	projectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID โปรเจกต์ไม่ถูกต้อง"})
		return
	}
	tasks, err := h.taskSvc.ListTasksByProject(c.Request.Context(), projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": tasks})
}

func (h *TaskHandler) ListMyTasks(c *gin.Context) {
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	tasks, err := h.taskSvc.ListTasksByUser(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[ListMyTasks] Error querying tasks for user %s: %v", userID, err)
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
		log.Printf("[UpdateTaskStatus Error] ID: %s, Error: %v", id, err)
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะงานสำเร็จ"})
}

// ListTaskEvents GET /api/tasks/:id/events
func (h *TaskHandler) ListTaskEvents(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	events, err := h.taskSvc.ListTaskEvents(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": events})
}

type addTaskCommentReq struct {
	Content string `json:"content" binding:"required"`
}

// AddTaskComment POST /api/tasks/:id/events
func (h *TaskHandler) AddTaskComment(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	var req addTaskCommentReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาพิมพ์ข้อความ"})
		return
	}
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	event, err := h.taskSvc.AddTaskComment(c.Request.Context(), id, userID, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มคอมเมนต์ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": event})
}

// ListAllTaskEvents GET /admin/tasks/events
func (h *TaskHandler) ListAllTaskEvents(c *gin.Context) {
	events, err := h.taskSvc.ListAllTaskEvents(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลประวัติทั้งหมดล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": events})
}

type submitWorkReq struct {
	URL string `json:"url" binding:"required,url"`
}

// SubmitTaskWork POST /api/tasks/:id/submissions
func (h *TaskHandler) SubmitTaskWork(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	var req submitWorkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL ไม่ถูกต้อง"})
		return
	}
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	sub, err := h.taskSvc.SubmitTaskWork(c.Request.Context(), id, userID, req.URL)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": sub})
}

// GetTaskSubmissions GET /api/tasks/:id/submissions and /admin/tasks/:id/submissions
func (h *TaskHandler) GetTaskSubmissions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	subs, err := h.taskSvc.GetTaskSubmissions(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": subs})
}

// ApproveSubmission POST /admin/tasks/:id/submissions/:submissionId/approve
func (h *TaskHandler) ApproveSubmission(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	subID, err := uuid.Parse(c.Param("submissionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การส่งงานไม่ถูกต้อง"})
		return
	}
	
	adminIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	adminID := adminIDRaw.(uuid.UUID)

	err = h.taskSvc.ApproveSubmission(c.Request.Context(), subID, taskID, adminID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อนุมัติงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อนุมัติงานสำเร็จ"})
}

type requestRevisionReq struct {
	Note string `json:"note" binding:"required"`
}

// RequestRevision POST /admin/tasks/:id/submissions/:submissionId/request-revision
func (h *TaskHandler) RequestRevision(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	subID, err := uuid.Parse(c.Param("submissionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การส่งงานไม่ถูกต้อง"})
		return
	}
	var req requestRevisionReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุหมายเหตุที่ให้แก้ไข"})
		return
	}
	
	adminIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	adminID := adminIDRaw.(uuid.UUID)

	err = h.taskSvc.RequestRevision(c.Request.Context(), subID, taskID, adminID, req.Note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ขอแก้ไขงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ส่งงานกลับให้แก้ไขสำเร็จ"})
}
