package handler

import (
	"net/http"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SubtaskHandler struct {
	repo *repository.SubtaskRepo
}

func NewSubtaskHandler(repo *repository.SubtaskRepo) *SubtaskHandler {
	return &SubtaskHandler{repo: repo}
}

func (h *SubtaskHandler) List(c *gin.Context) {
	taskID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	subtasks, err := h.repo.ListByTask(c.Request.Context(), taskID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot load subtasks"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": subtasks})
}

func (h *SubtaskHandler) Create(c *gin.Context) {
	taskID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		Title       string  `json:"title"`
		Description string  `json:"description"`
		Priority    string  `json:"priority"`
		DueDate     *string `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Priority == "" {
		req.Priority = "medium"
	}
	if !validPriority(req.Priority) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid priority"})
		return
	}
	subtask, err := h.repo.Create(c.Request.Context(), taskID, req.Title, req.Description, req.Priority, req.DueDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create subtask"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": subtask})
}

func (h *SubtaskHandler) Update(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		Status       *string `json:"status"`
		AdminComment *string `json:"admin_comment"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.Status == nil && req.AdminComment == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}
	if req.Status != nil && !validSubtaskStatus(*req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid status"})
		return
	}
	subtask, err := h.repo.Update(c.Request.Context(), id, req.Status, req.AdminComment)
	if repository.IsNotFound(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "subtask not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot update subtask"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": subtask})
}

func (h *SubtaskHandler) Delete(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	if err := h.repo.Delete(c.Request.Context(), id); err != nil {
		writeDeleteError(c, err, "subtask")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *SubtaskHandler) CreateCheckItem(c *gin.Context) {
	subtaskID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Title) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "title is required"})
		return
	}
	item, err := h.repo.CreateCheckItem(c.Request.Context(), subtaskID, strings.TrimSpace(req.Title))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot create check item"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "data": item})
}

func (h *SubtaskHandler) UpdateCheckItem(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		IsDone *bool   `json:"is_done"`
		Title  *string `json:"title"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	if req.IsDone == nil && req.Title == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no fields to update"})
		return
	}
	if req.Title != nil {
		trimmed := strings.TrimSpace(*req.Title)
		if trimmed == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "title cannot be empty"})
			return
		}
		req.Title = &trimmed
	}
	item, err := h.repo.UpdateCheckItem(c.Request.Context(), id, req.IsDone, req.Title)
	if repository.IsNotFound(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "check item not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot update check item"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": item})
}

func (h *SubtaskHandler) DeleteCheckItem(c *gin.Context) {
	id, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	if err := h.repo.DeleteCheckItem(c.Request.Context(), id); err != nil {
		writeDeleteError(c, err, "check item")
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func parseUUIDParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ID"})
		return uuid.Nil, false
	}
	return id, true
}

func writeDeleteError(c *gin.Context, err error, resource string) {
	if repository.IsNotFound(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": resource + " not found"})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "cannot delete " + resource})
}

func validPriority(value string) bool {
	switch value {
	case "low", "medium", "high", "urgent":
		return true
	default:
		return false
	}
}

func validSubtaskStatus(value string) bool {
	switch value {
	case "pending", "in_progress", "in_review", "completed":
		return true
	default:
		return false
	}
}
