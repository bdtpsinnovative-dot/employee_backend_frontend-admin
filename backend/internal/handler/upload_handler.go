package handler

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

const maxUploadSize = 50 * 1024 * 1024

// Ghostscript keeps vector text selectable but recompresses/downsamples the
// oversized images that normally make scanned PDFs huge. It is installed in
// the production image and can be overridden locally with GHOSTSCRIPT_BIN.
func ghostscriptBinary() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("GHOSTSCRIPT_BIN")); configured != "" {
		return configured, nil
	}
	for _, candidate := range []string{"gs", "gswin64c", "gswin32c"} {
		if binary, err := exec.LookPath(candidate); err == nil {
			return binary, nil
		}
	}
	return "", fmt.Errorf("ghostscript is not installed")
}

func compressPDFWithGhostscript(ctx context.Context, source io.Reader, originalSize int64) ([]byte, error) {
	binary, err := ghostscriptBinary()
	if err != nil {
		return nil, err
	}

	input, err := os.CreateTemp("", "upload-source-*.pdf")
	if err != nil {
		return nil, err
	}
	inputPath := input.Name()
	defer os.Remove(inputPath)
	defer input.Close()
	if _, err := io.Copy(input, source); err != nil {
		return nil, err
	}
	if err := input.Close(); err != nil {
		return nil, err
	}

	output, err := os.CreateTemp("", "upload-compressed-*.pdf")
	if err != nil {
		return nil, err
	}
	outputPath := output.Name()
	if err := output.Close(); err != nil {
		return nil, err
	}
	defer os.Remove(outputPath)

	// /ebook keeps normal document text crisp while resampling embedded images
	// to 120 DPI, our balanced setting for readable documents and small files.
	// It does not flatten the PDF into screenshots.
	command := exec.CommandContext(ctx, binary,
		"-sDEVICE=pdfwrite",
		"-dCompatibilityLevel=1.5",
		"-dPDFSETTINGS=/ebook",
		"-dDownsampleColorImages=true",
		"-dColorImageDownsampleType=/Bicubic",
		"-dColorImageResolution=120",
		// Ghostscript defaults to only downsampling images that are 1.5x
		// larger than the target. Setting 1.0 makes a 150 DPI scan actually
		// become 120 DPI instead of being passed through unchanged.
		"-dColorImageDownsampleThreshold=1.0",
		"-dAutoFilterColorImages=false",
		"-dColorImageFilter=/DCTEncode",
		"-dDownsampleGrayImages=true",
		"-dGrayImageDownsampleType=/Bicubic",
		"-dGrayImageResolution=120",
		"-dGrayImageDownsampleThreshold=1.0",
		"-dAutoFilterGrayImages=false",
		"-dGrayImageFilter=/DCTEncode",
		// 72 is a clear, document-safe JPEG quality and reduces the size of
		// scans that already arrived as JPEG-compressed PDF pages.
		"-dJPEGQ=72",
		"-dDownsampleMonoImages=true",
		"-dMonoImageResolution=300",
		"-dDetectDuplicateImages=true",
		"-dNOPAUSE", "-dQUIET", "-dBATCH",
		"-sOutputFile="+outputPath,
		inputPath,
	)
	if output, err := command.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("ghostscript: %w: %s", err, strings.TrimSpace(string(output)))
	}

	info, err := os.Stat(outputPath)
	if err != nil {
		return nil, err
	}
	// Never trade an upload for a larger result.
	if info.Size() <= 0 || (originalSize > 0 && info.Size() >= originalSize) {
		return nil, nil
	}
	return os.ReadFile(outputPath)
}

type UploadHandler struct {
	svc *service.StorageService
}

func NewUploadHandler(svc *service.StorageService) *UploadHandler {
	return &UploadHandler{svc: svc}
}

// UploadImage POST /api/upload
// Receives uploads for avatars and task attachments. PDFs are optimized without
// changing their visual quality before they are stored in R2.
func (h *UploadHandler) UploadImage(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadSize)
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		if strings.Contains(err.Error(), "request body too large") {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ไฟล์ต้องมีขนาดไม่เกิน 50 MB"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "ไม่พบไฟล์ที่อัปโหลด"})
		return
	}
	defer file.Close()
	if header.Size > maxUploadSize {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "ไฟล์ต้องมีขนาดไม่เกิน 50 MB"})
		return
	}

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

	uploadSource := io.Reader(file)
	storedSize := header.Size
	optimized := false
	if strings.EqualFold(ext, ".pdf") || strings.EqualFold(contentType, "application/pdf") {
		compressed, ghostscriptErr := compressPDFWithGhostscript(c.Request.Context(), file, header.Size)
		if ghostscriptErr != nil {
			log.Printf("PDF compression fallback for %q: %v", header.Filename, ghostscriptErr)
		}

		// pdfcpu is a lossless fallback for development machines without
		// Ghostscript, and for documents that Ghostscript cannot process.
		if len(compressed) == 0 {
			if _, seekErr := file.Seek(0, io.SeekStart); seekErr != nil {
				log.Printf("failed to rewind upload %q after PDF compression: %v", header.Filename, seekErr)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถเตรียมไฟล์สำหรับอัปโหลดได้"})
				return
			}
			var lossless bytes.Buffer
			config := model.NewDefaultConfiguration()
			if optimizeErr := api.Optimize(file, &lossless, config); optimizeErr == nil && lossless.Len() > 0 && (header.Size <= 0 || int64(lossless.Len()) < header.Size) {
				compressed = lossless.Bytes()
			}
		}

		if len(compressed) > 0 {
			uploadSource = bytes.NewReader(compressed)
			storedSize = int64(len(compressed))
			optimized = true
		} else if _, seekErr := file.Seek(0, io.SeekStart); seekErr != nil {
			log.Printf("failed to rewind upload %q after PDF optimization: %v", header.Filename, seekErr)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "ไม่สามารถเตรียมไฟล์สำหรับอัปโหลดได้"})
			return
		}
	}

	objectKey, err := h.svc.UploadFile(c.Request.Context(), uploadSource, fileName, contentType)
	if err != nil {
		log.Printf("R2 upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "อัปโหลดไฟล์ล้มเหลว: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":            true,
		"url":           "r2://" + objectKey,
		"original_size": header.Size,
		"stored_size":   storedSize,
		"optimized":     optimized,
	})
}

// DeleteUpload DELETE /api/upload?url=r2://<generated-file>
// Only accepts the UUID-based object keys generated by UploadImage. This
// prevents a request from deleting an arbitrary object or traversing a path.
func (h *UploadHandler) DeleteUpload(c *gin.Context) {
	rawURL := strings.TrimSpace(c.Query("url"))
	if !strings.HasPrefix(rawURL, "r2://") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "URL ไฟล์ไม่ถูกต้อง"})
		return
	}

	objectKey := strings.TrimPrefix(rawURL, "r2://")
	if objectKey == "" || filepath.Base(objectKey) != objectKey || strings.Contains(objectKey, `\`) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อไฟล์ไม่ถูกต้อง"})
		return
	}

	extension := filepath.Ext(objectKey)
	fileID := strings.TrimSuffix(objectKey, extension)
	if extension == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อไฟล์ไม่ถูกต้อง"})
		return
	}
	if _, err := uuid.Parse(fileID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อไฟล์ไม่ถูกต้อง"})
		return
	}

	if err := h.svc.DeleteObject(c.Request.Context(), objectKey); err != nil {
		log.Printf("R2 file delete failed for %q: %v", objectKey, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ลบไฟล์จาก Storage ไม่สำเร็จ"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
