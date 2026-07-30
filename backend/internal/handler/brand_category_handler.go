package handler

import (
	"context"
	"encoding/json"
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
	"github.com/jmoiron/sqlx"
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
	commentRepo    *repository.CardCommentRepo
	assigneeRepo   *repository.CardAssigneeRepo
	notifSvc       *service.NotificationService
}

func NewBrandCategoryHandler(
	brandRepo *repository.BrandRepo,
	categoryRepo *repository.TaskCategoryRepo,
	subItemRepo *repository.TaskSubItemRepo,
	listRepo *repository.TaskListRepo,
	cardRepo *repository.TaskCardRepo,
	attachmentRepo *repository.CardAttachmentRepo,
	commentRepo *repository.CardCommentRepo,
	assigneeRepo *repository.CardAssigneeRepo,
	notifSvc *service.NotificationService,
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
		commentRepo:    commentRepo,
		assigneeRepo:   assigneeRepo,
		notifSvc:       notifSvc,
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

func (h *BrandCategoryHandler) requireTaskAccess(c *gin.Context, taskID uuid.UUID) bool {
	role, _ := c.Get(middleware.ContextKeyRole)
	if role == "admin" {
		return true
	}

	userIDRaw, exists := c.Get(middleware.ContextKeyUserID)
	userID, ok := userIDRaw.(uuid.UUID)
	if !exists || !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "ไม่พบข้อมูลผู้ใช้งาน"})
		return false
	}

	var allowed bool
	err := h.cardRepo.GetDB().GetContext(c.Request.Context(), &allowed, `
		SELECT EXISTS (
			SELECT 1
			FROM tasks t
			WHERE t.id = $1
			  AND (
			    t.assigned_to = $2
			    OR t.assigned_by = $2
			    OR EXISTS (
			      SELECT 1 FROM task_assignees ta
			      WHERE ta.task_id = t.id AND ta.user_id = $2
			    )
			  )
		)
	`, taskID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบสิทธิ์งานล้มเหลว"})
		return false
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "คุณไม่มีสิทธิ์เข้าถึงงานนี้"})
		return false
	}
	return true
}

func (h *BrandCategoryHandler) taskIDForList(c *gin.Context, listID uuid.UUID) (uuid.UUID, bool) {
	var taskID uuid.UUID
	if err := h.cardRepo.GetDB().GetContext(
		c.Request.Context(),
		&taskID,
		`SELECT task_id FROM task_lists WHERE id = $1`,
		listID,
	); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการนี้"})
		return uuid.Nil, false
	}
	return taskID, true
}

func (h *BrandCategoryHandler) taskIDForCard(c *gin.Context, cardID uuid.UUID) (uuid.UUID, bool) {
	taskID, err := h.cardRepo.GetTaskID(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบการ์ดนี้"})
		return uuid.Nil, false
	}
	return taskID, true
}

func (h *BrandCategoryHandler) taskIDForSubItem(c *gin.Context, subItemID uuid.UUID) (uuid.UUID, bool) {
	var taskID uuid.UUID
	if err := h.cardRepo.GetDB().GetContext(
		c.Request.Context(),
		&taskID,
		`SELECT task_id FROM task_sub_items WHERE id = $1`,
		subItemID,
	); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบรายการย่อยนี้"})
		return uuid.Nil, false
	}
	return taskID, true
}

func (h *BrandCategoryHandler) validateTaskAssignees(
	c *gin.Context,
	taskID uuid.UUID,
	userIDs []uuid.UUID,
) bool {
	if len(userIDs) == 0 {
		return true
	}
	query, args, err := sqlx.In(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		JOIN tasks t ON t.id = ?
		WHERE u.id IN (?)
		  AND u.status = 'active'
		  AND (
		    EXISTS (
		      SELECT 1 FROM task_assignees ta
		      WHERE ta.task_id = t.id AND ta.user_id = u.id
		    )
		    OR (
		      t.project_id IS NOT NULL
		      AND EXISTS (
		        SELECT 1 FROM project_members pm
		        WHERE pm.project_id = t.project_id AND pm.user_id = u.id
		      )
		    )
		  )
	`, taskID, userIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบผู้รับผิดชอบล้มเหลว"})
		return false
	}
	query = h.cardRepo.GetDB().Rebind(query)
	var count int
	if err := h.cardRepo.GetDB().GetContext(c.Request.Context(), &count, query, args...); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบผู้รับผิดชอบล้มเหลว"})
		return false
	}
	if count != len(userIDs) {
		c.JSON(http.StatusForbidden, gin.H{"error": "ผู้รับผิดชอบต้องเป็นสมาชิกของงานหรือโปรเจกต์นี้"})
		return false
	}
	return true
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
	if !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForSubItem(c, id)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	if status != "pending" && status != "in_progress" && status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะรายการย่อยไม่ถูกต้อง"})
		return
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
	if !h.requireTaskAccess(c, taskID) {
		return
	}

	// 1. Fetch lists
	lists, err := h.listRepo.ListByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงรายการล้มเหลว"})
		return
	}

	// Reading a board must never create or move data. Empty boards are returned
	// as an empty list and can be initialized explicitly by the client.
	var allCardIDs []uuid.UUID
	for i := range lists {
		cards, err := h.cardRepo.ListByList(c.Request.Context(), lists[i].ID)
		if err != nil {
			continue
		}
		lists[i].Cards = cards
		for _, card := range cards {
			allCardIDs = append(allCardIDs, card.ID)
		}
	}

	// Fetch assignees in batch
	assigneesMap, err := h.assigneeRepo.ListByCards(c.Request.Context(), allCardIDs)
	if err != nil {
		assigneesMap = make(map[uuid.UUID][]domain.UserSummary)
	}

	for i := range lists {
		for j := range lists[i].Cards {
			cardID := lists[i].Cards[j].ID
			subItems, err := h.subItemRepo.ListByCard(c.Request.Context(), cardID)
			if err == nil {
				lists[i].Cards[j].SubItems = subItems
			} else {
				lists[i].Cards[j].SubItems = []domain.TaskSubItem{}
			}
			// Also load card attachments from card_attachments table
			attachments, err := h.attachmentRepo.ListByCard(c.Request.Context(), cardID)
			if err == nil {
				lists[i].Cards[j].Attachments = attachments
			} else {
				lists[i].Cards[j].Attachments = []domain.CardAttachment{}
			}
			// Assignees
			if assignees, ok := assigneesMap[cardID]; ok {
				lists[i].Cards[j].Assignees = assignees
			} else {
				lists[i].Cards[j].Assignees = []domain.UserSummary{}
			}
		}
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
	if !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForList(c, listID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForList(c, listID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}

	var req struct {
		Name         *string          `json:"name"`
		Description  *string          `json:"description"`
		SortOrder    *int             `json:"sort_order"`
		StartDate    *time.Time       `json:"start_date"`
		DueDate      *time.Time       `json:"due_date"`
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

	if req.Name != nil || req.Description != nil || req.StartDate != nil || req.DueDate != nil {
		if err := h.listRepo.UpdateDetail(
			c.Request.Context(),
			listID,
			req.Name,
			req.Description,
			req.StartDate,
			req.DueDate,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตรายการล้มเหลว"})
			return
		}
	}

	if req.SortOrder != nil {
		if err := h.listRepo.UpdateSortOrder(c.Request.Context(), listID, *req.SortOrder); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "เรียงลำดับรายการล้มเหลว"})
			return
		}
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

	taskID, ok := h.taskIDForList(c, listID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}

	assignerIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	assignerID := assignerIDRaw.(uuid.UUID)

	var req struct {
		Title       string     `json:"title"`
		Description string     `json:"description"`
		StartDate   *time.Time `json:"start_date"`
		DueDate     *time.Time `json:"due_date"`
		Priority    string     `json:"priority"`
		AssigneeIDs []string   `json:"assignee_ids"`
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
		Assignees:   []domain.UserSummary{},
	}

	if card.Priority == "" {
		card.Priority = "medium"
	}
	if card.Priority != "low" &&
		card.Priority != "medium" &&
		card.Priority != "high" &&
		card.Priority != "urgent" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ระดับความสำคัญไม่ถูกต้อง"})
		return
	}

	var uids []uuid.UUID
	for _, s := range req.AssigneeIDs {
		uid, err := uuid.Parse(s)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้รับผิดชอบไม่ถูกต้อง"})
			return
		}
		uids = append(uids, uid)
	}
	if !h.validateTaskAssignees(c, taskID, uids) {
		return
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

	// Save assignees if any are specified
	if len(uids) > 0 {
		_ = h.assigneeRepo.SetAssignees(c.Request.Context(), card.ID, uids, assignerID)
		if updatedAssignees, err := h.assigneeRepo.ListByCard(c.Request.Context(), card.ID); err == nil {
			card.Assignees = updatedAssignees
		}
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
	sourceTaskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, sourceTaskID) {
		return
	}

	var req struct {
		Title        *string    `json:"title"`
		Description  *string    `json:"description"`
		Status       *string    `json:"status"`
		ListID       *uuid.UUID `json:"list_id"`
		SortOrder    *int       `json:"sort_order"`
		StartDate    *time.Time `json:"start_date"`
		DueDate      *time.Time `json:"due_date"`
		AdminComment *string    `json:"admin_comment"`
		Priority     *string    `json:"priority"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	if req.Status != nil {
		if *req.Status != "pending" &&
			*req.Status != "in_progress" &&
			*req.Status != "completed" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "สถานะการ์ดไม่ถูกต้อง"})
			return
		}
	}

	if req.ListID != nil {
		targetTaskID, exists := h.taskIDForList(c, *req.ListID)
		if !exists {
			return
		}
		if targetTaskID != sourceTaskID {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่สามารถย้ายการ์ดข้ามบอร์ดงานได้"})
			return
		}
	}

	if req.Priority != nil {
		if *req.Priority != "low" &&
			*req.Priority != "medium" &&
			*req.Priority != "high" &&
			*req.Priority != "urgent" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ระดับความสำคัญไม่ถูกต้อง"})
			return
		}
	}

	err = h.cardRepo.Update(
		c.Request.Context(),
		cardID,
		req.Status,
		req.ListID,
		req.SortOrder,
		req.Title,
		req.Description,
		req.StartDate,
		req.DueDate,
		req.AdminComment,
		req.Priority,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตข้อมูลการ์ดล้มเหลว"})
		return
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
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForSubItem(c, subItemID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForSubItem(c, subItemID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForSubItem(c, subItemID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	role, _ := c.Get(middleware.ContextKeyRole)
	if role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "เฉพาะผู้ดูแลระบบเท่านั้นที่ตรวจงานได้"})
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
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
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
	var taskID uuid.UUID
	if err := h.cardRepo.GetDB().GetContext(c.Request.Context(), &taskID, `
		SELECT tl.task_id
		FROM card_attachments ca
		JOIN task_cards tc ON tc.id = ca.card_id
		JOIN task_lists tl ON tl.id = tc.list_id
		WHERE ca.id = $1
	`, attachmentID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบไฟล์แนบนี้"})
		return
	}
	if !h.requireTaskAccess(c, taskID) {
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

// ─────────────────────── Card Comment Handlers ───────────────────────────────

// GetCardComments GET /api/tasks/cards/:id/comments?cursor=<iso8601>&limit=30
func (h *BrandCategoryHandler) GetCardComments(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	limit := 30
	var cursor *time.Time
	if cs := c.Query("cursor"); cs != "" {
		if t, err := time.Parse(time.RFC3339Nano, cs); err == nil {
			cursor = &t
		}
	}
	comments, err := h.commentRepo.ListByCard(c.Request.Context(), cardID, cursor, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงคอมเมนต์ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": comments})
}

// CreateCardComment POST /api/tasks/cards/:id/comments
func (h *BrandCategoryHandler) CreateCardComment(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	authorIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	authorID := authorIDRaw.(uuid.UUID)

	var req struct {
		ContentDelta json.RawMessage `json:"content_delta" binding:"required"`
		PlainText    string          `json:"plain_text"`
		MentionedIDs []string        `json:"mentioned_user_ids"`
		Attachments  []struct {
			URL       string `json:"url"`
			Name      string `json:"name"`
			Type      string `json:"type"`
			SizeBytes *int64 `json:"size_bytes"`
		} `json:"attachments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	now := time.Now()
	comment := &domain.CardComment{
		ID:           uuid.New(),
		CardID:       cardID,
		AuthorID:     authorID,
		ContentDelta: req.ContentDelta,
		PlainText:    req.PlainText,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	var mentionIDs []uuid.UUID
	for _, s := range req.MentionedIDs {
		if uid, err := uuid.Parse(s); err == nil {
			mentionIDs = append(mentionIDs, uid)
		}
	}

	var attachments []domain.CommentAttachment
	for _, a := range req.Attachments {
		attachments = append(attachments, domain.CommentAttachment{
			ID:        uuid.New(),
			CommentID: comment.ID,
			URL:       a.URL,
			Name:      a.Name,
			Type:      a.Type,
			SizeBytes: a.SizeBytes,
			CreatedAt: now,
		})
	}

	if err := h.commentRepo.Create(c.Request.Context(), comment, mentionIDs, attachments); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างคอมเมนต์ล้มเหลว"})
		return
	}

	// Notifications: mentioned users + card assignees (excluding author)
	if h.notifSvc != nil {
		meta := map[string]string{
			"task_id": taskID.String(),
			"card_id": cardID.String(),
			"type":    "card_comment",
		}
		notifySet := map[uuid.UUID]bool{authorID: true}
		for _, uid := range mentionIDs {
			if !notifySet[uid] {
				notifySet[uid] = true
				go h.notifSvc.Notify(c.Request.Context(), uid,
					"มีการ @mention คุณ", req.PlainText, "task_comment", meta)
			}
		}
		// Notify card assignees (excluding already notified)
		if assignees, err := h.assigneeRepo.ListByCard(c.Request.Context(), cardID); err == nil {
			for _, a := range assignees {
				if !notifySet[a.ID] {
					notifySet[a.ID] = true
					go h.notifSvc.Notify(c.Request.Context(), a.ID,
						"มีคอมเมนต์ในการ์ดที่คุณรับผิดชอบ", req.PlainText, "task_comment", meta)
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": comment})
}

// UpdateCardComment PATCH /api/tasks/cards/:id/comments/:commentId
func (h *BrandCategoryHandler) UpdateCardComment(c *gin.Context) {
	commentID, err := uuid.Parse(c.Param("commentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID คอมเมนต์ไม่ถูกต้อง"})
		return
	}
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)
	userRoleRaw, _ := c.Get(middleware.ContextKeyRole)
	userRole, _ := userRoleRaw.(string)

	existing, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบคอมเมนต์"})
		return
	}
	taskID, ok := h.taskIDForCard(c, existing.CardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	if existing.AuthorID != userID && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์แก้ไขคอมเมนต์นี้"})
		return
	}

	var req struct {
		ContentDelta json.RawMessage `json:"content_delta" binding:"required"`
		PlainText    string          `json:"plain_text"`
		MentionedIDs []string        `json:"mentioned_user_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	var mentionIDs []uuid.UUID
	for _, s := range req.MentionedIDs {
		if uid, err := uuid.Parse(s); err == nil {
			mentionIDs = append(mentionIDs, uid)
		}
	}

	if err := h.commentRepo.Update(c.Request.Context(), commentID, req.ContentDelta, req.PlainText, mentionIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "แก้ไขคอมเมนต์ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteCardComment DELETE /api/tasks/cards/:id/comments/:commentId
func (h *BrandCategoryHandler) DeleteCardComment(c *gin.Context) {
	commentID, err := uuid.Parse(c.Param("commentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID คอมเมนต์ไม่ถูกต้อง"})
		return
	}
	userIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	userID := userIDRaw.(uuid.UUID)
	userRoleRaw, _ := c.Get(middleware.ContextKeyRole)
	userRole, _ := userRoleRaw.(string)

	existing, err := h.commentRepo.GetByID(c.Request.Context(), commentID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบคอมเมนต์"})
		return
	}
	taskID, ok := h.taskIDForCard(c, existing.CardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	if existing.AuthorID != userID && userRole != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "ไม่มีสิทธิ์ลบคอมเมนต์นี้"})
		return
	}

	if err := h.commentRepo.Delete(c.Request.Context(), commentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบคอมเมนต์ล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ลบคอมเมนต์สำเร็จ"})
}

// ─────────────────────── Card Assignee Handlers ──────────────────────────────

// GetCardAssignees GET /api/tasks/cards/:id/assignees
func (h *BrandCategoryHandler) GetCardAssignees(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}
	taskID, ok := h.taskIDForCard(c, cardID)
	if !ok || !h.requireTaskAccess(c, taskID) {
		return
	}
	assignees, err := h.assigneeRepo.ListByCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงผู้รับผิดชอบล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": assignees})
}

// UpdateCardAssignees PUT /api/tasks/cards/:id/assignees
func (h *BrandCategoryHandler) UpdateCardAssignees(c *gin.Context) {
	cardID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID การ์ดไม่ถูกต้อง"})
		return
	}
	assignerIDRaw, _ := c.Get(middleware.ContextKeyUserID)
	assignerID := assignerIDRaw.(uuid.UUID)
	userRoleRaw, _ := c.Get(middleware.ContextKeyRole)
	userRole, _ := userRoleRaw.(string)

	// 1. Get task ID for the card
	taskID, err := h.commentRepo.GetTaskIDByCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบการ์ดหรือบอร์ดงานของการ์ดนี้"})
		return
	}

	// 2. Fetch task details for permission checks
	type taskPermissionMeta struct {
		ID         uuid.UUID  `db:"id"`
		ProjectID  *uuid.UUID `db:"project_id"`
		AssignedTo *uuid.UUID `db:"assigned_to"`
		AssignedBy *uuid.UUID `db:"assigned_by"`
	}
	var task taskPermissionMeta
	err = h.cardRepo.GetDB().GetContext(c.Request.Context(), &task, `
		SELECT id, project_id, assigned_to, assigned_by FROM tasks WHERE id = $1
	`, taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลงานล้มเหลว"})
		return
	}

	// 3. Permission checks
	isAuthorized := false
	if userRole == "admin" {
		isAuthorized = true
	} else if task.AssignedTo != nil && *task.AssignedTo == assignerID {
		isAuthorized = true
	} else if task.AssignedBy != nil && *task.AssignedBy == assignerID {
		isAuthorized = true
	} else {
		// Check if assigner is a task assignee
		var isTaskMember bool
		err = h.cardRepo.GetDB().GetContext(c.Request.Context(), &isTaskMember, `
			SELECT EXISTS(
				SELECT 1 FROM task_assignees WHERE task_id = $1 AND user_id = $2
			)
		`, task.ID, assignerID)
		if err == nil && isTaskMember {
			isAuthorized = true
		}
	}

	if !isAuthorized {
		c.JSON(http.StatusForbidden, gin.H{"error": "คุณไม่มีสิทธิ์แก้ไขการ์ดงานนี้"})
		return
	}

	var req struct {
		AssigneeIDs []string `json:"assignee_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	// 4. Validate and Parse all input assignee IDs
	var uids []uuid.UUID
	for _, s := range req.AssigneeIDs {
		uid, err := uuid.Parse(s)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ID ผู้รับผิดชอบไม่ถูกต้อง"})
			return
		}
		uids = append(uids, uid)
	}

	// 5. Verify all assignees are active and belong to project (or task if no project)
	if len(uids) > 0 {
		var validCount int
		if task.ProjectID != nil {
			query, args, err := sqlx.In(`
				SELECT COUNT(DISTINCT u.id)
				FROM users u
				JOIN project_members pm ON pm.user_id = u.id
				WHERE pm.project_id = ? AND u.status = 'active' AND u.id IN (?)
			`, *task.ProjectID, uids)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบข้อมูลผู้รับผิดชอบล้มเหลว"})
				return
			}
			query = h.cardRepo.GetDB().Rebind(query)
			err = h.cardRepo.GetDB().GetContext(c.Request.Context(), &validCount, query, args...)
		} else {
			query, args, err := sqlx.In(`
				SELECT COUNT(DISTINCT u.id)
				FROM users u
				JOIN task_assignees ta ON ta.user_id = u.id
				WHERE ta.task_id = ? AND u.status = 'active' AND u.id IN (?)
			`, task.ID, uids)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบข้อมูลผู้รับผิดชอบล้มเหลว"})
				return
			}
			query = h.cardRepo.GetDB().Rebind(query)
			err = h.cardRepo.GetDB().GetContext(c.Request.Context(), &validCount, query, args...)
		}

		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ตรวจสอบข้อมูลผู้รับผิดชอบล้มเหลว"})
			return
		}

		if validCount != len(uids) {
			c.JSON(http.StatusForbidden, gin.H{"error": "ผู้รับผิดชอบบางคนไม่มีสิทธิ์หรือสถานะไม่ถูกต้อง"})
			return
		}
	}

	// 6. Get existing assignees to optimize notifications
	existingAssignees, err := h.assigneeRepo.ListByCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลผู้รับผิดชอบเดิมล้มเหลว"})
		return
	}
	existingMap := make(map[uuid.UUID]bool)
	for _, a := range existingAssignees {
		existingMap[a.ID] = true
	}

	var newlyAdded []uuid.UUID
	for _, uid := range uids {
		if !existingMap[uid] && uid != assignerID {
			newlyAdded = append(newlyAdded, uid)
		}
	}

	// 7. Update assignees database
	if err := h.assigneeRepo.SetAssignees(c.Request.Context(), cardID, uids, assignerID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตผู้รับผิดชอบล้มเหลว"})
		return
	}

	// 8. Notify only new assignees via background context (Background Goroutine)
	if h.notifSvc != nil && len(newlyAdded) > 0 {
		meta := map[string]string{
			"task_id": taskID.String(),
			"card_id": cardID.String(),
			"type":    "card_assigned",
		}
		bgCtx := context.Background()
		for _, uid := range newlyAdded {
			go func(u uuid.UUID) {
				h.notifSvc.Notify(bgCtx, u,
					"คุณถูกมอบหมายการ์ดงาน", "คุณถูกเพิ่มเป็นผู้รับผิดชอบการ์ดงาน", "task_comment", meta)
			}(uid)
		}
	}

	// 9. Fetch and return updated assignees (Canonical Source of Truth)
	updatedAssignees, err := h.assigneeRepo.ListByCard(c.Request.Context(), cardID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงข้อมูลผู้รับผิดชอบที่อัปเดตล้มเหลว"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "data": updatedAssignees})
}

// GetTaskMembers GET /api/tasks/:id/members — returns all assignees for a task (board members)
func (h *BrandCategoryHandler) GetTaskMembers(c *gin.Context) {
	taskID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID งานไม่ถูกต้อง"})
		return
	}
	if !h.requireTaskAccess(c, taskID) {
		return
	}

	var projectID *uuid.UUID
	err = h.cardRepo.GetDB().GetContext(c.Request.Context(), &projectID, `
		SELECT project_id FROM tasks WHERE id = $1
	`, taskID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบงานนี้"})
		return
	}

	var members []domain.UserSummary
	if projectID != nil {
		err = h.cardRepo.GetDB().SelectContext(c.Request.Context(), &members, `
			SELECT DISTINCT u.id, u.first_name, u.last_name, u.avatar_url, u.position
			FROM project_members pm
			JOIN users u ON u.id = pm.user_id
			WHERE pm.project_id = $1 AND u.status = 'active'
			ORDER BY u.first_name, u.last_name
		`, *projectID)
	} else {
		err = h.cardRepo.GetDB().SelectContext(c.Request.Context(), &members, `
			SELECT DISTINCT u.id, u.first_name, u.last_name, u.avatar_url, u.position
			FROM task_assignees ta
			JOIN users u ON u.id = ta.user_id
			WHERE ta.task_id = $1 AND u.status = 'active'
			ORDER BY u.first_name, u.last_name
		`, taskID)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ดึงสมาชิกงานล้มเหลว"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": members})
}

// UpdateCardAttachment PATCH /api/tasks/cards/attachments/:id
// อัปเดตชื่อ/URL ของไฟล์แนบ
func (h *BrandCategoryHandler) UpdateCardAttachment(c *gin.Context) {
	attachmentID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID ไฟล์แนบไม่ถูกต้อง"})
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
		URL  string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง"})
		return
	}

	var taskID uuid.UUID
	if err := h.cardRepo.GetDB().GetContext(c.Request.Context(), &taskID, `
		SELECT tl.task_id
		FROM card_attachments ca
		JOIN task_cards tc ON tc.id = ca.card_id
		JOIN task_lists tl ON tl.id = tc.list_id
		WHERE ca.id = $1
	`, attachmentID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบไฟล์แนบนี้"})
		return
	}
	if !h.requireTaskAccess(c, taskID) {
		return
	}

	scope, _ := h.eventRepo.ScopeForAttachment(c.Request.Context(), attachmentID)
	
	if err := h.attachmentRepo.Update(c.Request.Context(), attachmentID, req.Name, req.URL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปเดตไฟล์แนบล้มเหลว"})
		return
	}

	h.audit(c, scope, "attachment_updated", "แก้ไขไฟล์แนบเป็น: "+req.Name, nil)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "อัปเดตไฟล์แนบสำเร็จ"})
}
