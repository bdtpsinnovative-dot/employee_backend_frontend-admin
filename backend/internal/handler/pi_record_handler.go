package handler

import (
	"net/http"

	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/gin-gonic/gin"
)

// PIRecordHandler intentionally has only a list operation for this application.
type PIRecordHandler struct {
	repo *repository.PIRecordRepo
}

func NewPIRecordHandler(repo *repository.PIRecordRepo) *PIRecordHandler {
	return &PIRecordHandler{repo: repo}
}

func (h *PIRecordHandler) List(c *gin.Context) {
	records, err := h.repo.List(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": records})
}
