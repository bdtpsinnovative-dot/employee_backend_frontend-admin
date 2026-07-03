package handler

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"

	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UploadHandler struct {
	svc *service.StorageService
}

func NewUploadHandler(svc *service.StorageService) *UploadHandler {
	return &UploadHandler{svc: svc}
}

// UploadImage POST /api/upload
// Receives an image (e.g. avatar, check-in photo) and uploads to R2.
func (h *UploadHandler) UploadImage(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบไฟล์ที่อัปโหลด"})
		return
	}
	defer file.Close()

	// Generate a unique filename
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".webp" // default to webp since flutter will send webp
	}
	fileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)

	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "image/webp"
	}

	objectKey, err := h.svc.UploadFile(c.Request.Context(), file, fileName, contentType)
	if err != nil {
		log.Printf("R2 upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปโหลดไฟล์ล้มเหลว: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":  true,
		"url": "r2://" + objectKey,
	})
}
