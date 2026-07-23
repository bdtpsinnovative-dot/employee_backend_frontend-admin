package handler

import (
	"net/http"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// BrandCategoryHandler จัดการ Brand และ TaskCategory
type BrandCategoryHandler struct {
	brandRepo      *repository.BrandRepo
	categoryRepo   *repository.TaskCategoryRepo
	subItemRepo    *repository.TaskSubItemRepo
	listRepo       *repository.TaskListRepo
	cardRepo       *repository.TaskCardRepo
	attachmentRepo *repository.CardAttachmentRepo
}

func NewBrandCategoryHandler(
	brandRepo *repository.BrandRepo,
	categoryRepo *repository.TaskCategoryRepo,
	subItemRepo *repository.TaskSubItemRepo,
	listRepo *repository.TaskListRepo,
	cardRepo *repository.TaskCardRepo,
	attachmentRepo *repository.CardAttachmentRepo,
) *BrandCategoryHandler {
	return &BrandCategoryHandler{
		brandRepo:      brandRepo,
		categoryRepo:   categoryRepo,
		subItemRepo:    subItemRepo,
		listRepo:       listRepo,
		cardRepo:       cardRepo,
		attachmentRepo: attachmentRepo,
	}
}

// ─────────────────────── Brand Handlers ───────────────────────

// ListBrands GET /admin/brands
func (h *BrandCategoryHandler) ListBrands(c *gin.Context) {
	brands, err := h.brandRepo.ListAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูล Brand ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": brands})
}

// CreateBrand POST /admin/brands
func (h *BrandCategoryHandler) CreateBrand(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อ Brand"})
		return
	}

	brand := &domain.Brand{
		ID:        uuid.New(),
		Name:      req.Name,
		CreatedAt: time.Now(),
	}
	if err := h.brandRepo.Create(c.Request.Context(), brand); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่ม Brand ล้มเหลว"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": brand})
}

// DeleteBrand DELETE /admin/brands/:id
func (h *BrandCategoryHandler) DeleteBrand(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID Brand ไม่ถูกต้อง"})
		return
	}
	if err := h.brandRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบ Brand ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบ Brand สำเร็จ"})
}

// ─────────────────────── TaskCategory Handlers ───────────────────────

// ListTaskCategories GET /admin/task-categories
func (h *BrandCategoryHandler) ListTaskCategories(c *gin.Context) {
	categories, err := h.categoryRepo.ListAll(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลหมวดหมู่งานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": categories})
}

// CreateTaskCategory POST /admin/task-categories
func (h *BrandCategoryHandler) CreateTaskCategory(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อหมวดหมู่"})
		return
	}

	cat := &domain.TaskCategory{
		ID:        uuid.New(),
		Name:      req.Name,
		CreatedAt: time.Now(),
	}
	if err := h.categoryRepo.Create(c.Request.Context(), cat); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มหมวดหมู่งานล้มเหลว"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": cat})
}

// DeleteTaskCategory DELETE /admin/task-categories/:id
func (h *BrandCategoryHandler) DeleteTaskCategory(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID หมวดหมู่ไม่ถูกต้อง"})
		return
	}
	if err := h.categoryRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบหมวดหมู่งานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบหมวดหมู่งานสำเร็จ"})
}

// ─────────────────────── TaskSubItem Handlers ───────────────────────

// ListTaskSubItems GET /admin/tasks/:id/sub-items
func (h *BrandCategoryHandler) ListTaskSubItems(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	items, err := h.subItemRepo.ListByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงรายการย่อยล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": items})
}

// CreateTaskSubItem POST /api/tasks/:id/sub-items
func (h *BrandCategoryHandler) CreateTaskSubItem(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	item := domain.TaskSubItem{
		ID:        uuid.New(),
		TaskID:    taskID,
		Title:     req.Title,
		IsDone:    false,
		Status:    "pending",
		SortOrder: 0,
		CreatedAt: time.Now(),
	}

	if err := h.subItemRepo.CreateBatch(c.Request.Context(), []domain.TaskSubItem{item}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มรายการย่อยล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": item})
}

// ToggleTaskSubItem PATCH /api/tasks/sub-items/:id/toggle
func (h *BrandCategoryHandler) ToggleTaskSubItem(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการย่อยไม่ถูกต้อง"})
		return
	}

	var req struct {
		Status string `json:"status"`
		IsDone *bool  `json:"is_done"`
	}
	_ = c.ShouldBindJSON(&req)

	status := req.Status
	if status == "" && req.IsDone != nil {
		if *req.IsDone {
			status = "completed"
		} else {
			status = "pending"
		}
	}

	if status == "" {
		item, err := h.subItemRepo.GetByID(c.Request.Context(), id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการย่อย"})
			return
		}
		if item.IsDone || item.Status == "completed" {
			status = "pending"
		} else {
			status = "completed"
		}
	}

	if err := h.subItemRepo.UpdateSubItemStatus(c.Request.Context(), id, status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะรายการย่อยล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตสถานะสำเร็จ"})
}

// GetTaskTrelloBoard GET /api/tasks/:id/trello
func (h *BrandCategoryHandler) GetTaskTrelloBoard(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	// 1. Fetch sub-items for the task
	subItems, err := h.subItemRepo.ListByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลรายการย่อยล้มเหลว"})
		return
	}

	// 2. Mock 3 fixed lists
	todoID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	doingID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	doneID := uuid.MustParse("00000000-0000-0000-0000-000000000003")

	lists := []domain.TaskList{
		{ID: todoID, TaskID: taskID, Name: "Todo", SortOrder: 1},
		{ID: doingID, TaskID: taskID, Name: "Doing", SortOrder: 2},
		{ID: doneID, TaskID: taskID, Name: "Done", SortOrder: 3},
	}

	var todoCards []domain.TaskCard
	var doingCards []domain.TaskCard
	var doneCards []domain.TaskCard

	for _, si := range subItems {
		// Map SubItem to TaskCard
		status := si.Status
		if si.IsDone {
			status = "completed"
		}

		var listID uuid.UUID
		if status == "completed" {
			listID = doneID
		} else if status == "in_progress" {
			listID = doingID
		} else {
			listID = todoID
		}

		card := domain.TaskCard{
			ID:           si.ID, // use sub-item ID as card ID
			ListID:       listID,
			Title:        si.Title,
			Description:  si.Description,
			Status:       status,
			SortOrder:    si.SortOrder,
			CreatedAt:    si.CreatedAt,
			StartDate:    si.StartDate,
			DueDate:      si.DueDate,
			Priority:     si.Priority,
			AdminComment: si.AdminComment,
			SubItems:     []domain.TaskSubItem{si}, // include itself as subitem for UI mapping if needed
		}

		// Map verifications (which might be requested by UI)
		// For now we don't query it unless we need it, but let's just leave SubItems loaded.

		if listID == doneID {
			doneCards = append(doneCards, card)
		} else if listID == doingID {
			doingCards = append(doingCards, card)
		} else {
			todoCards = append(todoCards, card)
		}
	}

	lists[0].Cards = todoCards
	lists[1].Cards = doingCards
	lists[2].Cards = doneCards

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": lists})
}

// CreateTaskList POST /api/tasks/:id/lists
func (h *BrandCategoryHandler) CreateTaskList(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อรายการ"})
		return
	}

	list := domain.TaskList{
		ID:        uuid.New(),
		TaskID:    taskID,
		Name:      req.Name,
		SortOrder: 99,
		CreatedAt: time.Now(),
	}

	if err := h.listRepo.Create(c.Request.Context(), &list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างรายการล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": list})
}

// DeleteTaskList DELETE /api/tasks/lists/:id
func (h *BrandCategoryHandler) DeleteTaskList(c *gin.Context) {
	listID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการไม่ถูกต้อง"})
		return
	}

	if err := h.listRepo.Delete(c.Request.Context(), listID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบรายการล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบรายการสำเร็จ"})
}

// UpdateTaskList PATCH /api/tasks/lists/:id
func (h *BrandCategoryHandler) UpdateTaskList(c *gin.Context) {
	listID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการไม่ถูกต้อง"})
		return
	}

	var req struct {
		Name        *string    `json:"name"`
		Description *string    `json:"description"`
		SortOrder   *int       `json:"sort_order"`
		StartDate   *time.Time `json:"start_date"`
		DueDate     *time.Time `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if req.Name != nil || req.Description != nil || req.StartDate != nil || req.DueDate != nil {
		name := ""
		if req.Name != nil {
			name = *req.Name
		}
		desc := ""
		if req.Description != nil {
			desc = *req.Description
		}
		_ = h.listRepo.UpdateDetail(c.Request.Context(), listID, name, desc, req.StartDate, req.DueDate)
	}

	if req.SortOrder != nil {
		_ = h.listRepo.UpdateSortOrder(c.Request.Context(), listID, *req.SortOrder)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตรายการสำเร็จ"})
}

// CreateTaskCard POST /api/tasks/lists/:id/cards
func (h *BrandCategoryHandler) CreateTaskCard(c *gin.Context) {
	listID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการไม่ถูกต้อง"})
		return
	}

	var req struct {
		TaskID      string     `json:"task_id"`
		Title       string     `json:"title"`
		Description string     `json:"description"`
		StartDate   *time.Time `json:"start_date"`
		DueDate     *time.Time `json:"due_date"`
		Priority    string     `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" || req.TaskID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}

	taskID, err := uuid.Parse(req.TaskID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "TaskID ไม่ถูกต้อง"})
		return
	}

	status := "pending"
	isDone := false
	if listID.String() == "00000000-0000-0000-0000-000000000003" {
		status = "completed"
		isDone = true
	} else if listID.String() == "00000000-0000-0000-0000-000000000002" {
		status = "in_progress"
	}

	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	si := domain.TaskSubItem{
		ID:          uuid.New(),
		TaskID:      taskID,
		Title:       req.Title,
		Description: req.Description,
		IsDone:      isDone,
		Status:      status,
		SortOrder:   99,
		CreatedAt:   time.Now(),
		StartDate:   req.StartDate,
		DueDate:     req.DueDate,
		Priority:    priority,
	}

	if err := h.subItemRepo.Create(c.Request.Context(), &si); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างการ์ดล้มเหลว"})
		return
	}

	card := domain.TaskCard{
		ID:          si.ID,
		ListID:      listID,
		Title:       si.Title,
		Description: si.Description,
		Status:      status,
		SortOrder:   si.SortOrder,
		CreatedAt:   si.CreatedAt,
		StartDate:   si.StartDate,
		DueDate:     si.DueDate,
		Priority:    si.Priority,
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": card})
}

// UpdateTaskCard PATCH /api/tasks/cards/:id
func (h *BrandCategoryHandler) UpdateTaskCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	var req struct {
		Title        string     `json:"title"`
		Description  string     `json:"description"`
		Status       string     `json:"status"`
		ListID       *uuid.UUID `json:"list_id"`
		StartDate    *time.Time `json:"start_date"`
		DueDate      *time.Time `json:"due_date"`
		AdminComment *string    `json:"admin_comment"`
		Priority     string     `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if req.ListID != nil {
		status := "pending"
		if req.ListID.String() == "00000000-0000-0000-0000-000000000003" {
			status = "completed"
		} else if req.ListID.String() == "00000000-0000-0000-0000-000000000002" {
			status = "in_progress"
		}

		if err := h.subItemRepo.UpdateSubItemStatus(c.Request.Context(), cardID, status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ย้ายการ์ดไปยังรายการอื่นล้มเหลว"})
			return
		}
	}

	if req.Status != "" {
		if err := h.subItemRepo.UpdateSubItemStatus(c.Request.Context(), cardID, req.Status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะการ์ดล้มเหลว"})
			return
		}
	}

	if req.Title != "" || req.StartDate != nil || req.DueDate != nil || req.AdminComment != nil || req.Description != "" || req.Priority != "" {
		priority := req.Priority
		if priority == "" {
			priority = "medium" // default if not provided
		}
		err = h.subItemRepo.UpdateSubItemDetail(c.Request.Context(), cardID, req.Title, req.Description, priority, req.StartDate, req.DueDate, nil, nil, nil, req.AdminComment)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตข้อมูลการ์ดล้มเหลว"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตการ์ดสำเร็จ"})
}

// DeleteTaskCard DELETE /api/tasks/cards/:id
func (h *BrandCategoryHandler) DeleteTaskCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	if err := h.subItemRepo.Delete(c.Request.Context(), cardID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบการ์ดล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบการ์ดสำเร็จ"})
}

// CreateCardSubItem POST /api/tasks/cards/:id/sub-items
func (h *BrandCategoryHandler) CreateCardSubItem(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	taskID, err := h.cardRepo.GetTaskID(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่พบข้อมูลงาน"})
		return
	}

	item := domain.TaskSubItem{
		ID:        uuid.New(),
		TaskID:    taskID,
		CardID:    &cardID,
		Title:     req.Title,
		IsDone:    false,
		Status:    "pending",
		SortOrder: 99,
		CreatedAt: time.Now(),
	}

	err = h.subItemRepo.Create(c.Request.Context(), &item)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เพิ่มรายการย่อยล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": item})
}

// UpdateCardSubItemDetail PATCH /api/tasks/sub-items/:id/detail
func (h *BrandCategoryHandler) UpdateCardSubItemDetail(c *gin.Context) {
	subItemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการย่อยไม่ถูกต้อง"})
		return
	}

	var req struct {
		Title             string     `json:"title"`
		Description       string     `json:"description"`
		Priority          string     `json:"priority"`
		StartDate         *time.Time `json:"start_date"`
		DueDate           *time.Time `json:"due_date"`
		LinkURL           *string    `json:"link_url"`
		AttachmentURL     *string    `json:"attachment_url"`
		VerificationNotes *string    `json:"verification_notes"`
		AdminComment      *string    `json:"admin_comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	priority := req.Priority
	if priority == "" {
		priority = "medium"
	}

	err = h.subItemRepo.UpdateSubItemDetail(
		c.Request.Context(),
		subItemID,
		req.Title,
		req.Description,
		priority,
		req.StartDate,
		req.DueDate,
		req.LinkURL,
		req.AttachmentURL,
		req.VerificationNotes,
		req.AdminComment,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตรายละเอียดรายการย่อยล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตรายละเอียดสำเร็จ"})
}

// DeleteTaskSubItem DELETE /api/tasks/sub-items/:id
func (h *BrandCategoryHandler) DeleteTaskSubItem(c *gin.Context) {
	subItemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการย่อยไม่ถูกต้อง"})
		return
	}

	if err := h.subItemRepo.Delete(c.Request.Context(), subItemID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบรายการย่อยล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบรายการย่อยสำเร็จ"})
}

// CreateSubItemVerification POST /api/tasks/sub-items/:id/verifications
func (h *BrandCategoryHandler) CreateSubItemVerification(c *gin.Context) {
	subItemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการย่อยไม่ถูกต้อง"})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"` // "approved" | "rejected"
		Notes  string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if req.Status != "approved" && req.Status != "rejected" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะการตรวจสอบต้องเป็น approved หรือ rejected"})
		return
	}

	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)

	verifierNameRaw, _ := c.Get("user_fullname")
	verifierName := ""
	if verifierNameRaw != nil {
		verifierName = verifierNameRaw.(string)
	}
	if verifierName == "" {
		verifierName = "ผู้ตรวจสอบ"
	}

	// 1. Get max round
	maxRound, err := h.subItemRepo.GetMaxRound(c.Request.Context(), subItemID)
	if err != nil {
		maxRound = 0
	}
	nextRound := maxRound + 1

	// 2. Create verification round
	v := domain.SubItemVerification{
		ID:           uuid.New(),
		SubItemID:    subItemID,
		VerifiedBy:   &userID,
		VerifierName: verifierName,
		Round:        nextRound,
		Status:       req.Status,
		Notes:        &req.Notes,
		CreatedAt:    time.Now(),
	}

	if err := h.subItemRepo.CreateVerification(c.Request.Context(), &v); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกประวัติการตรวจสอบล้มเหลว"})
		return
	}

	// 3. Update the sub-item status/is_done based on verification status
	subItemStatus := "pending"
	if req.Status == "approved" {
		subItemStatus = "completed"
	}
	_ = h.subItemRepo.UpdateSubItemStatus(c.Request.Context(), subItemID, subItemStatus)

	// Update verification notes field on the sub-item itself to show latest notes
	_ = h.subItemRepo.UpdateSubItemVerificationNotes(c.Request.Context(), subItemID, req.Notes)

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": v})
}

// ─────────────────────── Card Attachments ───────────────────────

// CreateCardAttachment POST /api/tasks/cards/:id/attachments
// เพิ่มไฟล์แนบ/รูปภาพ/ลิงก์ในการ์ด
func (h *BrandCategoryHandler) CreateCardAttachment(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	var req struct {
		URL  string `json:"url" binding:"required"`
		Name string `json:"name"`
		Type string `json:"type"` // "image" | "file" | "link"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	// Normalize type
	attachType := req.Type
	if attachType == "" {
		attachType = "file"
	}

	userIDRaw, _ := c.Get("user_id")
	var createdBy *uuid.UUID
	if userIDRaw != nil {
		if uid, ok := userIDRaw.(uuid.UUID); ok {
			createdBy = &uid
		} else if uidStr, ok := userIDRaw.(string); ok {
			if parsed, err := uuid.Parse(uidStr); err == nil {
				createdBy = &parsed
			}
		}
	}

	attachment := &domain.CardAttachment{
		ID:        uuid.New(),
		CardID:    cardID,
		URL:       req.URL,
		Name:      req.Name,
		Type:      attachType,
		CreatedAt: time.Now(),
		CreatedBy: createdBy,
	}

	if err := h.attachmentRepo.Create(c.Request.Context(), attachment); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกไฟล์แนบล้มเหลว: " + err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": attachment})
}

// ListCardAttachments GET /api/tasks/cards/:id/attachments
// ดึงไฟล์แนบทั้งหมดของการ์ด
func (h *BrandCategoryHandler) ListCardAttachments(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	attachments, err := h.attachmentRepo.ListByCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลไฟล์แนบล้มเหลว"})
		return
	}

	if attachments == nil {
		attachments = []domain.CardAttachment{}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": attachments})
}

// DeleteCardAttachment DELETE /api/tasks/cards/attachments/:id
// ลบไฟล์แนบ
func (h *BrandCategoryHandler) DeleteCardAttachment(c *gin.Context) {
	attachmentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไฟล์แนบไม่ถูกต้อง"})
		return
	}

	if err := h.attachmentRepo.Delete(c.Request.Context(), attachmentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบไฟล์แนบล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบไฟล์แนบสำเร็จ"})
}
