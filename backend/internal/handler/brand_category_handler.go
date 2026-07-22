package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

// BrandCategoryHandler จัดการ Brand และ TaskCategory
type BrandCategoryHandler struct {
	brandRepo          *repository.BrandRepo
	categoryRepo       *repository.TaskCategoryRepo
	subItemRepo        *repository.TaskSubItemRepo
	listRepo           *repository.TaskListRepo
	cardRepo           *repository.TaskCardRepo
	attachmentRepo     *repository.CardAttachmentRepo
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
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	status := req.Status
	if status == "" && req.IsDone != nil {
		if *req.IsDone {
			status = "completed"
		} else {
			status = "pending"
		}
	}

	if status == "" {
		status = "pending"
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

	// 1. Fetch lists
	lists, err := h.listRepo.ListByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงรายการล้มเหลว"})
		return
	}

	// 2. If lists is empty, auto-create default list and card for backward compatibility
	if len(lists) == 0 {
		defaultList := domain.TaskList{
			ID:        uuid.New(),
			TaskID:    taskID,
			Name:      "ทำอะไร",
			SortOrder: 0,
			CreatedAt: time.Now(),
		}
		if err := h.listRepo.Create(c.Request.Context(), &defaultList); err == nil {
			defaultCard := domain.TaskCard{
				ID:          uuid.New(),
				ListID:      defaultList.ID,
				Title:       "การ์ดงาน",
				Description: "การ์ดงานตั้งต้น",
				Status:      "pending",
				SortOrder:   0,
				CreatedAt:   time.Now(),
			}
			if err := h.cardRepo.Create(c.Request.Context(), &defaultCard); err == nil {
				// Link all existing task sub-items to this card!
				_ = h.subItemRepo.LinkSubItemsToCard(c.Request.Context(), defaultCard.ID, taskID)
			}
			// reload lists
			lists, _ = h.listRepo.ListByTask(c.Request.Context(), taskID)
		}
	}

	// 3. Load cards, sub-items, and attachments
	for i := range lists {
		cards, err := h.cardRepo.ListByList(c.Request.Context(), lists[i].ID)
		if err != nil {
			continue
		}
		for j := range cards {
			subItems, err := h.subItemRepo.ListByCard(c.Request.Context(), cards[j].ID)
			if err == nil {
				cards[j].SubItems = subItems
			} else {
				cards[j].SubItems = []domain.TaskSubItem{}
			}
			// Also load card attachments from card_attachments table
			attachments, err := h.attachmentRepo.ListByCard(c.Request.Context(), cards[j].ID)
			if err == nil {
				cards[j].Attachments = attachments
			} else {
				cards[j].Attachments = []domain.CardAttachment{}
			}
		}
		lists[i].Cards = cards
	}

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
		Title       string     `json:"title"`
		Description string     `json:"description"`
		StartDate   *time.Time `json:"start_date"`
		DueDate     *time.Time `json:"due_date"`
		Priority    string     `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อการ์ด"})
		return
	}

	card := domain.TaskCard{
		ID:          uuid.New(),
		ListID:      listID,
		Title:       req.Title,
		Description: req.Description,
		Status:      "pending",
		SortOrder:   99,
		CreatedAt:   time.Now(),
		StartDate:   req.StartDate,
		DueDate:     req.DueDate,
		Priority:    req.Priority,
	}

	if card.Priority == "" {
		card.Priority = "medium"
	}

	if err := h.cardRepo.Create(c.Request.Context(), &card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างการ์ดล้มเหลว"})
		return
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

	if req.Status != "" {
		if err := h.cardRepo.UpdateStatus(c.Request.Context(), cardID, req.Status); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะการ์ดล้มเหลว"})
			return
		}
	}

	if req.ListID != nil {
		if err := h.cardRepo.MoveToList(c.Request.Context(), cardID, *req.ListID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ย้ายการ์ดไปยังรายการอื่นล้มเหลว"})
			return
		}
	}

	if req.Title != "" || req.StartDate != nil || req.DueDate != nil || req.AdminComment != nil || req.Description != "" || req.Priority != "" {
		if req.Priority == "" {
			req.Priority = "medium"
		}
		err = h.cardRepo.UpdateCard(c.Request.Context(), cardID, req.Title, req.Description, req.StartDate, req.DueDate, req.AdminComment, req.Priority)
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

	if err := h.cardRepo.Delete(c.Request.Context(), cardID); err != nil {
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

	err = h.subItemRepo.UpdateSubItemDetail(
		c.Request.Context(),
		subItemID,
		req.Title,
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
