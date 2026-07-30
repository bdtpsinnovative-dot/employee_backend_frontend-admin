package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
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
	eventRepo      *repository.TaskEventRepo
	userRepo       *repository.UserRepo
}

func NewBrandCategoryHandler(
	brandRepo *repository.BrandRepo,
	categoryRepo *repository.TaskCategoryRepo,
	subItemRepo *repository.TaskSubItemRepo,
	listRepo *repository.TaskListRepo,
	cardRepo *repository.TaskCardRepo,
	attachmentRepo *repository.CardAttachmentRepo,
	eventRepo *repository.TaskEventRepo,
	userRepo *repository.UserRepo,
) *BrandCategoryHandler {
	return &BrandCategoryHandler{
		brandRepo:      brandRepo,
		categoryRepo:   categoryRepo,
		subItemRepo:    subItemRepo,
		listRepo:       listRepo,
		cardRepo:       cardRepo,
		attachmentRepo: attachmentRepo,
		eventRepo:      eventRepo,
		userRepo:       userRepo,
	}
}

func (h *BrandCategoryHandler) audit(c *gin.Context, scope *repository.TaskEventScope, action, content string, taskID *uuid.UUID) {
	if err := recordTaskEvent(c, h.eventRepo, scope, action, content, taskID); err != nil {
		log.Printf("task audit write failed (%s): %v", action, err)
	}
}

type boardAuditChange struct {
	action  string
	content string
}

type boardAuditAttachment struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Type string `json:"type"`
}

func readableAuditValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "ไม่ได้ระบุ"
	}
	runes := []rune(value)
	if len(runes) > 100 {
		value = string(runes[:100]) + "…"
	}
	return "“" + value + "”"
}

func readableAuditDate(value *time.Time) string {
	if value == nil {
		return "ไม่ได้ระบุ"
	}
	return value.In(time.Local).Format("02/01/2006")
}

func sameAuditDate(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.Format("2006-01-02") == right.Format("2006-01-02")
}

func readableBoardPriority(value string) string {
	switch value {
	case "low":
		return "ต่ำ"
	case "medium":
		return "ปานกลาง"
	case "high":
		return "สูง"
	default:
		return readableAuditValue(value)
	}
}

func readableBoardStatus(value string) string {
	switch value {
	case "pending":
		return "รอดำเนินการ"
	case "in_progress", "doing":
		return "กำลังทำ"
	case "completed", "done":
		return "เสร็จแล้ว"
	default:
		return readableAuditValue(value)
	}
}

func parseBoardAuditAttachments(raw []byte) []boardAuditAttachment {
	var attachments []boardAuditAttachment
	if len(raw) == 0 {
		return attachments
	}
	_ = json.Unmarshal(raw, &attachments)
	return attachments
}

func boardAttachmentKey(attachment boardAuditAttachment) string {
	return strings.TrimSpace(attachment.Type) + "\x00" + strings.TrimSpace(attachment.URL) + "\x00" + strings.TrimSpace(attachment.Name)
}

func attachmentAuditChanges(before, after []boardAuditAttachment) []boardAuditChange {
	beforeSet := make(map[string]boardAuditAttachment, len(before))
	afterSet := make(map[string]boardAuditAttachment, len(after))
	for _, attachment := range before {
		beforeSet[boardAttachmentKey(attachment)] = attachment
	}
	for _, attachment := range after {
		afterSet[boardAttachmentKey(attachment)] = attachment
	}

	changes := make([]boardAuditChange, 0)
	for key, attachment := range afterSet {
		if _, exists := beforeSet[key]; !exists {
			changes = append(changes, boardAuditChange{
				action:  "board_attachment_added",
				content: "เพิ่มเอกสารหรือลิงก์: " + readableAuditValue(attachment.Name),
			})
		}
	}
	for key, attachment := range beforeSet {
		if _, exists := afterSet[key]; !exists {
			changes = append(changes, boardAuditChange{
				action:  "board_attachment_removed",
				content: "ลบเอกสารหรือลิงก์: " + readableAuditValue(attachment.Name),
			})
		}
	}
	return changes
}

func uuidAuditSet(ids []uuid.UUID) map[uuid.UUID]struct{} {
	result := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		result[id] = struct{}{}
	}
	return result
}

func changedAuditAssignees(before, after []uuid.UUID) (added, removed []uuid.UUID) {
	beforeSet := uuidAuditSet(before)
	afterSet := uuidAuditSet(after)
	for _, id := range after {
		if _, exists := beforeSet[id]; !exists {
			added = append(added, id)
		}
	}
	for _, id := range before {
		if _, exists := afterSet[id]; !exists {
			removed = append(removed, id)
		}
	}
	return added, removed
}

func (h *BrandCategoryHandler) auditUserNames(c *gin.Context, ids []uuid.UUID) string {
	names := make([]string, 0, len(ids))
	for _, id := range ids {
		user, err := h.userRepo.FindByID(c.Request.Context(), id)
		if err != nil {
			names = append(names, id.String())
			continue
		}
		name := strings.TrimSpace(user.FirstName + " " + user.LastName)
		if name == "" {
			name = strings.TrimSpace(user.Nickname)
		}
		if name == "" {
			name = id.String()
		}
		names = append(names, name)
	}
	return strings.Join(names, ", ")
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
	h.audit(c, nil, "brand_created", "สร้างแบรนด์: "+brand.Name, nil)
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
	h.audit(c, nil, "brand_deleted", "ลบแบรนด์: "+id.String(), nil)
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
	h.audit(c, nil, "task_category_created", "สร้างหมวดหมู่งาน: "+cat.Name, nil)
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
	h.audit(c, nil, "task_category_deleted", "ลบหมวดหมู่งาน: "+id.String(), nil)
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
	scope := &repository.TaskEventScope{TaskID: taskID, SubItemID: &item.ID, Name: item.Title}
	h.audit(c, scope, "sub_item_created", "เพิ่มรายการย่อย: "+item.Title, nil)

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

	scope, _ := h.eventRepo.ScopeForSubItem(c.Request.Context(), id)
	if err := h.subItemRepo.UpdateSubItemStatus(c.Request.Context(), id, status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตสถานะรายการย่อยล้มเหลว"})
		return
	}
	h.audit(c, scope, "sub_item_status_changed", "เปลี่ยนสถานะรายการย่อยเป็น: "+status, nil)

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
			ID:           uuid.New(),
			TaskID:       taskID,
			Name:         "ทำอะไร",
			SortOrder:    0,
			Priority:     "medium",
			Status:       "in_progress",
			AdminComment: "",
			Attachments:  json.RawMessage("[]"),
			CreatedAt:    time.Now(),
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

	// Auto-link legacy unlinked sub-items (where card_id IS NULL) to the first card once
	if len(lists) > 0 {
		firstCards, err := h.cardRepo.ListByList(c.Request.Context(), lists[0].ID)
		if err == nil && len(firstCards) > 0 {
			_ = h.subItemRepo.LinkSubItemsToCard(c.Request.Context(), firstCards[0].ID, taskID)
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
				log.Printf("[ListByCard ERROR] cardID %s: %v", cards[j].ID, err)
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

// GetTaskTrelloBoardTrash GET /api/tasks/:id/trello/trash
func (h *BrandCategoryHandler) GetTaskTrelloBoardTrash(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	lists, err := h.listRepo.ListTrashByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงรายการถังขยะล้มเหลว"})
		return
	}

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

// RestoreTaskList POST /api/tasks/lists/:id/restore
func (h *BrandCategoryHandler) RestoreTaskList(c *gin.Context) {
	listID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการไม่ถูกต้อง"})
		return
	}

	if err := h.listRepo.Restore(c.Request.Context(), listID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "กู้คืนรายการล้มเหลว"})
		return
	}

	scope, _ := h.eventRepo.ScopeForList(c.Request.Context(), listID)
	name := listID.String()
	if scope != nil && scope.Name != "" {
		name = scope.Name
	}
	h.audit(c, scope, "board_restored", "กู้คืนบอร์ด: "+name, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "กู้คืนรายการสำเร็จ"})
}

// CreateTaskList POST /api/tasks/:id/lists
func (h *BrandCategoryHandler) CreateTaskList(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}

	var req struct {
		Name         string      `json:"name"`
		Description  *string     `json:"description"`
		StartDate    *string     `json:"start_date"`
		DueDate      *string     `json:"due_date"`
		Priority     string      `json:"priority"`
		Status       string      `json:"status"`
		AdminComment *string     `json:"admin_comment"`
		AssigneeIDs  []uuid.UUID `json:"assignee_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกชื่อรายการ"})
		return
	}

	var startDate *time.Time
	if req.StartDate != nil && *req.StartDate != "" {
		parsed, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			startDate = &parsed
		}
	}
	var dueDate *time.Time
	if req.DueDate != nil && *req.DueDate != "" {
		parsed, err := time.Parse("2006-01-02", *req.DueDate)
		if err == nil {
			dueDate = &parsed
		}
	}

	if req.Priority == "" {
		req.Priority = "medium"
	}
	if req.Status == "" {
		req.Status = "in_progress"
	}

	desc := ""
	if req.Description != nil {
		desc = *req.Description
	}

	comment := ""
	if req.AdminComment != nil {
		comment = *req.AdminComment
	}

	list := domain.TaskList{
		ID:           uuid.New(),
		TaskID:       taskID,
		Name:         req.Name,
		Description:  desc,
		StartDate:    startDate,
		DueDate:      dueDate,
		Priority:     req.Priority,
		Status:       req.Status,
		AdminComment: comment,
		Attachments:  json.RawMessage("[]"),
		AssigneeIDs:  req.AssigneeIDs,
		CreatedAt:    time.Now(),
	}

	if err := h.listRepo.Create(c.Request.Context(), &list); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างรายการล้มเหลว"})
		return
	}
	scope := &repository.TaskEventScope{TaskID: taskID, ListID: &list.ID, Name: list.Name}
	h.audit(c, scope, "board_created", "สร้างบอร์ด: "+list.Name, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": list})
}

// DeleteTaskList DELETE /api/tasks/lists/:id
func (h *BrandCategoryHandler) DeleteTaskList(c *gin.Context) {
	listID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการไม่ถูกต้อง"})
		return
	}

	scope, _ := h.eventRepo.ScopeForList(c.Request.Context(), listID)
	if err := h.listRepo.Delete(c.Request.Context(), listID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบรายการล้มเหลว"})
		return
	}
	name := listID.String()
	if scope != nil && scope.Name != "" {
		name = scope.Name
	}
	h.audit(c, scope, "board_deleted", "ลบบอร์ด: "+name, nil)

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
		Name         *string          `json:"name"`
		Description  *string          `json:"description"`
		SortOrder    *int             `json:"sort_order"`
		StartDate    *string          `json:"start_date"`
		DueDate      *string          `json:"due_date"`
		Priority     *string          `json:"priority"`
		Status       *string          `json:"status"`
		AdminComment *string          `json:"admin_comment"`
		Attachments  *json.RawMessage `json:"attachments"`
		AssigneeIDs  *[]uuid.UUID     `json:"assignee_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	existing, err := h.listRepo.Get(c.Request.Context(), listID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการที่ต้องการแก้ไข"})
		return
	}

	var startDate *time.Time
	if req.StartDate != nil {
		if *req.StartDate != "" {
			parsed, err := time.Parse("2006-01-02", *req.StartDate)
			if err != nil {
				parsed, err = time.Parse(time.RFC3339, *req.StartDate)
			}
			if err == nil {
				startDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันเริ่มต้นไม่ถูกต้อง"})
				return
			}
		}
	} else if existing.StartDate != nil {
		startDate = existing.StartDate
	}

	var dueDate *time.Time
	if req.DueDate != nil {
		if *req.DueDate != "" {
			parsed, err := time.Parse("2006-01-02", *req.DueDate)
			if err != nil {
				parsed, err = time.Parse(time.RFC3339, *req.DueDate)
			}
			if err == nil {
				dueDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันกำหนดส่งไม่ถูกต้อง"})
				return
			}
		}
	} else if existing.DueDate != nil {
		dueDate = existing.DueDate
	}

	name := existing.Name
	if req.Name != nil {
		name = *req.Name
	}
	desc := existing.Description
	if req.Description != nil {
		desc = *req.Description
	}
	priority := existing.Priority
	if req.Priority != nil {
		priority = *req.Priority
	}
	status := existing.Status
	if req.Status != nil {
		status = *req.Status
	}
	adminComment := existing.AdminComment
	if req.AdminComment != nil {
		adminComment = *req.AdminComment
	}
	var attachments []byte
	if req.Attachments != nil {
		attachments = *req.Attachments
	} else {
		attachments = existing.Attachments
	}

	changes := make([]boardAuditChange, 0, 10)
	if req.Name != nil && name != existing.Name {
		changes = append(changes, boardAuditChange{
			action:  "board_name_changed",
			content: "เปลี่ยนชื่อบอร์ดจาก " + readableAuditValue(existing.Name) + " เป็น " + readableAuditValue(name),
		})
	}
	if req.Description != nil && desc != existing.Description {
		changes = append(changes, boardAuditChange{
			action:  "board_description_changed",
			content: "เปลี่ยนรายละเอียดจาก " + readableAuditValue(existing.Description) + " เป็น " + readableAuditValue(desc),
		})
	}
	if req.StartDate != nil && !sameAuditDate(existing.StartDate, startDate) {
		changes = append(changes, boardAuditChange{
			action:  "board_start_date_changed",
			content: "เปลี่ยนวันเริ่มต้นจาก " + readableAuditDate(existing.StartDate) + " เป็น " + readableAuditDate(startDate),
		})
	}
	if req.DueDate != nil && !sameAuditDate(existing.DueDate, dueDate) {
		changes = append(changes, boardAuditChange{
			action:  "board_due_date_changed",
			content: "เปลี่ยนวันกำหนดส่งจาก " + readableAuditDate(existing.DueDate) + " เป็น " + readableAuditDate(dueDate),
		})
	}
	if req.Priority != nil && priority != existing.Priority {
		changes = append(changes, boardAuditChange{
			action:  "board_priority_changed",
			content: "เปลี่ยนความสำคัญจาก " + readableBoardPriority(existing.Priority) + " เป็น " + readableBoardPriority(priority),
		})
	}
	if req.Status != nil && status != existing.Status {
		changes = append(changes, boardAuditChange{
			action:  "board_status_changed",
			content: "เปลี่ยนสถานะจาก " + readableBoardStatus(existing.Status) + " เป็น " + readableBoardStatus(status),
		})
	}
	if req.AdminComment != nil && adminComment != existing.AdminComment {
		changes = append(changes, boardAuditChange{
			action:  "board_note_changed",
			content: "เปลี่ยนหมายเหตุจาก " + readableAuditValue(existing.AdminComment) + " เป็น " + readableAuditValue(adminComment),
		})
	}
	if req.Attachments != nil {
		changes = append(changes, attachmentAuditChanges(
			parseBoardAuditAttachments(existing.Attachments),
			parseBoardAuditAttachments(attachments),
		)...)
	}
	var addedAssignees, removedAssignees []uuid.UUID
	if req.AssigneeIDs != nil {
		addedAssignees, removedAssignees = changedAuditAssignees(existing.AssigneeIDs, *req.AssigneeIDs)
	}
	if req.SortOrder != nil && *req.SortOrder != existing.SortOrder {
		changes = append(changes, boardAuditChange{
			action:  "board_order_changed",
			content: fmt.Sprintf("เปลี่ยนลำดับบอร์ดจาก %d เป็น %d", existing.SortOrder+1, *req.SortOrder+1),
		})
	}

	err = h.listRepo.UpdateDetail(c.Request.Context(), listID, name, desc, priority, status, adminComment, attachments, startDate, dueDate, req.AssigneeIDs)
	if err != nil {
		log.Printf("UpdateTaskList Detail failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตรายละเอียดรายการล้มเหลว: " + err.Error()})
		return
	}

	if req.SortOrder != nil {
		_ = h.listRepo.UpdateSortOrder(c.Request.Context(), listID, *req.SortOrder)
	}
	scope := &repository.TaskEventScope{TaskID: existing.TaskID, ListID: &listID, Name: name}
	if len(addedAssignees) > 0 {
		changes = append(changes, boardAuditChange{
			action:  "board_assignees_added",
			content: "เพิ่มผู้รับผิดชอบ: " + h.auditUserNames(c, addedAssignees),
		})
	}
	if len(removedAssignees) > 0 {
		changes = append(changes, boardAuditChange{
			action:  "board_assignees_removed",
			content: "นำผู้รับผิดชอบออก: " + h.auditUserNames(c, removedAssignees),
		})
	}
	for _, change := range changes {
		h.audit(c, scope, change.action, change.content, nil)
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
		Title       string      `json:"title"`
		Description string      `json:"description"`
		StartDate   *time.Time  `json:"start_date"`
		DueDate     *time.Time  `json:"due_date"`
		Priority    string      `json:"priority"`
		AssigneeIDs []uuid.UUID `json:"assignee_ids"`
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
		AssigneeIDs: req.AssigneeIDs,
	}

	if card.Priority == "" {
		card.Priority = "medium"
	}

	if err := h.cardRepo.Create(c.Request.Context(), &card); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างการ์ดล้มเหลว"})
		return
	}
	scope, _ := h.eventRepo.ScopeForList(c.Request.Context(), listID)
	if scope != nil {
		scope.CardID = &card.ID
		scope.Name = card.Title
	}
	h.audit(c, scope, "card_created", "สร้างการ์ดงาน: "+card.Title, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": card})
}

// UpdateTaskCard PATCH /api/tasks/cards/:id
func (h *BrandCategoryHandler) UpdateTaskCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}
	originalScope, _ := h.eventRepo.ScopeForCard(c.Request.Context(), cardID)

	var req struct {
		Title        string       `json:"title"`
		Description  string       `json:"description"`
		Status       string       `json:"status"`
		ListID       *uuid.UUID   `json:"list_id"`
		StartDate    *string      `json:"start_date"`
		DueDate      *string      `json:"due_date"`
		AdminComment *string      `json:"admin_comment"`
		Priority     string       `json:"priority"`
		AssigneeIDs  *[]uuid.UUID `json:"assignee_ids"`
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

	var startDate *time.Time
	if req.StartDate != nil {
		if *req.StartDate != "" {
			parsed, err := time.Parse("2006-01-02", *req.StartDate)
			if err != nil {
				parsed, err = time.Parse(time.RFC3339, *req.StartDate)
			}
			if err == nil {
				startDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันเริ่มต้นไม่ถูกต้อง"})
				return
			}
		}
	}

	var dueDate *time.Time
	if req.DueDate != nil {
		if *req.DueDate != "" {
			parsed, err := time.Parse("2006-01-02", *req.DueDate)
			if err != nil {
				parsed, err = time.Parse(time.RFC3339, *req.DueDate)
			}
			if err == nil {
				dueDate = &parsed
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"error": "รูปแบบวันกำหนดส่งไม่ถูกต้อง"})
				return
			}
		}
	}

	if req.Title != "" || req.StartDate != nil || req.DueDate != nil || req.AdminComment != nil || req.Description != "" || req.Priority != "" || req.AssigneeIDs != nil {
		if req.Priority == "" {
			req.Priority = "medium"
		}
		err = h.cardRepo.UpdateCard(c.Request.Context(), cardID, req.Title, req.Description, startDate, dueDate, req.AdminComment, req.Priority, req.AssigneeIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตข้อมูลการ์ดล้มเหลว"})
			return
		}
	}

	scope, scopeErr := h.eventRepo.ScopeForCard(c.Request.Context(), cardID)
	if scopeErr != nil {
		scope = originalScope
	}
	cardName := cardID.String()
	if scope != nil && scope.Name != "" {
		cardName = scope.Name
	}
	action := "card_updated"
	content := "แก้ไขการ์ดงาน: " + cardName
	if req.ListID != nil {
		action = "card_moved"
		content = "ย้ายการ์ดงาน: " + cardName
	} else if req.Status != "" {
		action = "card_status_changed"
		content = "เปลี่ยนสถานะการ์ด " + cardName + " เป็น: " + req.Status
	}
	h.audit(c, scope, action, content, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตการ์ดสำเร็จ"})
}

// DeleteTaskCard DELETE /api/tasks/cards/:id
func (h *BrandCategoryHandler) DeleteTaskCard(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}

	scope, _ := h.eventRepo.ScopeForCard(c.Request.Context(), cardID)
	if err := h.cardRepo.Delete(c.Request.Context(), cardID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบการ์ดล้มเหลว"})
		return
	}
	name := cardID.String()
	if scope != nil && scope.Name != "" {
		name = scope.Name
	}
	h.audit(c, scope, "card_deleted", "ลบการ์ดงาน: "+name, nil)

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
		Title   string     `json:"title"`
		DueDate *time.Time `json:"due_date"`
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
		DueDate:   req.DueDate,
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
	scope, _ := h.eventRepo.ScopeForCard(c.Request.Context(), cardID)
	if scope != nil {
		scope.SubItemID = &item.ID
		scope.Name = item.Title
	}
	h.audit(c, scope, "sub_item_created", "เพิ่มรายการย่อย: "+item.Title, nil)

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

	scope, _ := h.eventRepo.ScopeForSubItem(c.Request.Context(), subItemID)
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
	name := req.Title
	if name == "" && scope != nil {
		name = scope.Name
	}
	h.audit(c, scope, "sub_item_updated", "แก้ไขรายการย่อย: "+name, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตรายละเอียดสำเร็จ"})
}

// DeleteTaskSubItem DELETE /api/tasks/sub-items/:id
func (h *BrandCategoryHandler) DeleteTaskSubItem(c *gin.Context) {
	subItemID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID รายการย่อยไม่ถูกต้อง"})
		return
	}

	scope, _ := h.eventRepo.ScopeForSubItem(c.Request.Context(), subItemID)
	if err := h.subItemRepo.Delete(c.Request.Context(), subItemID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบรายการย่อยล้มเหลว"})
		return
	}
	name := subItemID.String()
	if scope != nil && scope.Name != "" {
		name = scope.Name
	}
	h.audit(c, scope, "sub_item_deleted", "ลบรายการย่อย: "+name, nil)

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
	scope, _ := h.eventRepo.ScopeForSubItem(c.Request.Context(), subItemID)

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
	verificationLabel := "ไม่ผ่าน"
	if req.Status == "approved" {
		verificationLabel = "ผ่าน"
	}
	h.audit(c, scope, "sub_item_verified", "ตรวจรายการย่อย: "+verificationLabel, nil)

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
	scope, _ := h.eventRepo.ScopeForCard(c.Request.Context(), cardID)
	attachmentName := attachment.Name
	if attachmentName == "" {
		attachmentName = attachment.URL
	}
	h.audit(c, scope, "attachment_created", "เพิ่มไฟล์แนบ: "+attachmentName, nil)

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

	scope, _ := h.eventRepo.ScopeForAttachment(c.Request.Context(), attachmentID)
	if err := h.attachmentRepo.Delete(c.Request.Context(), attachmentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบไฟล์แนบล้มเหลว"})
		return
	}
	name := attachmentID.String()
	if scope != nil && scope.Name != "" {
		name = scope.Name
	}
	h.audit(c, scope, "attachment_deleted", "ลบไฟล์แนบ: "+name, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบไฟล์แนบสำเร็จ"})
}
