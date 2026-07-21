package handler

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const faceEmbeddingSize = 192

type UserHandler struct {
	svc *service.UserService
}

func NewUserHandler(svc *service.UserService) *UserHandler {
	return &UserHandler{svc: svc}
}

type registerBody struct {
	AuthID     string    `json:"auth_id" binding:"required"`
	Email      string    `json:"email" binding:"required"`
	FirstName  string    `json:"first_name" binding:"required"`
	LastName   string    `json:"last_name" binding:"required"`
	AvatarURL  string    `json:"avatar_url" binding:"required"`
	FaceVector []float64 `json:"face_vector" binding:"required"`
}

// Register creates the application profile after Supabase authentication.
func (h *UserHandler) Register(c *gin.Context) {
	var body registerBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบ"})
		return
	}

	authID, err := uuid.Parse(body.AuthID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "auth_id ไม่ถูกต้อง"})
		return
	}

	faceVector, err := formatFaceVector(body.FaceVector, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.svc.Register(
		c.Request.Context(),
		authID,
		body.Email,
		strings.TrimSpace(body.FirstName),
		strings.TrimSpace(body.LastName),
		stringPointer(strings.TrimSpace(body.AvatarURL)),
		faceVector,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างบัญชีล้มเหลว: " + err.Error()})
		return
	}
	user.HasFace = user.FaceEmbedding != nil &&
		strings.TrimSpace(*user.FaceEmbedding) != ""

	c.JSON(http.StatusCreated, gin.H{
		"ok":      true,
		"message": "สมัครสมาชิกสำเร็จ กรุณารอแอดมินอนุมัติบัญชี",
		"data":    user,
	})
}

// GetMe returns the current application user without exposing face_embedding.
func (h *UserHandler) GetMe(c *gin.Context) {
	authIDValue, exists := c.Get(middleware.ContextKeyAuthID)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}
	authID, err := uuid.Parse(authIDValue.(string))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "โทเคนไม่ถูกต้อง"})
		return
	}

	user, err := h.svc.GetByAuthID(c.Request.Context(), authID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลผู้ใช้"})
		return
	}
	user.HasFace = user.FaceEmbedding != nil &&
		strings.TrimSpace(*user.FaceEmbedding) != ""

	c.Set(middleware.ContextKeyUserID, user.ID)
	c.Set(middleware.ContextKeyRole, user.Role)
	c.Set(middleware.ContextKeyStatus, user.Status)
	c.JSON(http.StatusOK, gin.H{"ok": true, "data": user})
}

type completeProfileBody struct {
	FirstName  string    `json:"first_name" binding:"required"`
	LastName   string    `json:"last_name" binding:"required"`
	AvatarURL  string    `json:"avatar_url" binding:"required"`
	FaceVector []float64 `json:"face_vector" binding:"required"`
}

// CompleteProfile fills all required fields for an existing user.
func (h *UserHandler) CompleteProfile(c *gin.Context) {
	var body completeProfileBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณากรอกข้อมูลโปรไฟล์ให้ครบ"})
		return
	}

	firstName := strings.TrimSpace(body.FirstName)
	lastName := strings.TrimSpace(body.LastName)
	avatarURL := strings.TrimSpace(body.AvatarURL)
	if firstName == "" || lastName == "" || avatarURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อ นามสกุล และรูปโปรไฟล์ห้ามเว้นว่าง"})
		return
	}
	faceVector, err := formatFaceVector(body.FaceVector, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, exists := currentUserID(c)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลผู้ใช้"})
		return
	}

	if err := h.svc.CompleteProfile(
		c.Request.Context(),
		userID,
		firstName,
		lastName,
		avatarURL,
		*faceVector,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกโปรไฟล์ไม่สำเร็จ: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "บันทึกโปรไฟล์สำเร็จ"})
}

type updateProfileInfoBody struct {
	FirstName string `json:"first_name" binding:"required"`
	LastName  string `json:"last_name" binding:"required"`
	AvatarURL string `json:"avatar_url" binding:"required"`
}

// UpdateProfileInfo updates name and avatar only.
func (h *UserHandler) UpdateProfileInfo(c *gin.Context) {
	var body updateProfileInfoBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน"})
		return
	}

	firstName := strings.TrimSpace(body.FirstName)
	lastName := strings.TrimSpace(body.LastName)
	avatarURL := strings.TrimSpace(body.AvatarURL)
	if firstName == "" || lastName == "" || avatarURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ชื่อ นามสกุล หรือรูปภาพว่างไม่ได้"})
		return
	}

	userID, exists := currentUserID(c)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบผู้ใช้"})
		return
	}

	if err := h.svc.UpdateProfileInfo(c.Request.Context(), userID, firstName, lastName, avatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลไม่สำเร็จ: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "บันทึกข้อมูลเรียบร้อย"})
}

type bindDeviceBody struct {
	DeviceID string `json:"device_id" binding:"required"`
}

// BindDevice binds the current account to one device.
func (h *UserHandler) BindDevice(c *gin.Context) {
	var body bindDeviceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาระบุ device_id"})
		return
	}

	userID, exists := currentUserID(c)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลผู้ใช้"})
		return
	}
	if err := h.svc.BindDevice(c.Request.Context(), userID, body.DeviceID); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ผูกเครื่องสำเร็จ"})
}

type updateFaceBody struct {
	FaceVector []float64 `json:"face_vector" binding:"required"`
}

// UpdateFace replaces the biometric template. Pending users are allowed to call it.
func (h *UserHandler) UpdateFace(c *gin.Context) {
	var body updateFaceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "กรุณาส่ง face_vector"})
		return
	}

	faceVector, err := formatFaceVector(body.FaceVector, true)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, exists := currentUserID(c)
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "ไม่พบข้อมูลผู้ใช้"})
		return
	}

	if err := h.svc.UpdateFaceEmbedding(
		c.Request.Context(),
		userID,
		*faceVector,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "บันทึกข้อมูลใบหน้าไม่สำเร็จ: " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "บันทึกข้อมูลใบหน้าสำเร็จ"})
}

func currentUserID(c *gin.Context) (uuid.UUID, bool) {
	value, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		return uuid.Nil, false
	}
	id, ok := value.(uuid.UUID)
	return id, ok
}

func formatFaceVector(values []float64, required bool) (*string, error) {
	if len(values) == 0 && !required {
		return nil, nil
	}
	if len(values) != faceEmbeddingSize {
		return nil, fmt.Errorf("face_vector ต้องมี %d ค่า", faceEmbeddingSize)
	}

	var builder strings.Builder
	builder.Grow(faceEmbeddingSize * 12)
	builder.WriteByte('[')
	for index, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, fmt.Errorf("face_vector มีค่าที่ไม่ถูกต้อง")
		}
		if index > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.FormatFloat(value, 'g', 10, 64))
	}
	builder.WriteByte(']')
	result := builder.String()
	return &result, nil
}

func stringPointer(value string) *string {
	return &value
}

type fcmTokenBody struct {
	FcmToken string `json:"fcm_token" binding:"required"`
}

func (h *UserHandler) UpdateFcmToken(c *gin.Context) {
	userIDVal, exists := c.Get(middleware.ContextKeyUserID)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "กรุณาเข้าสู่ระบบ"})
		return
	}
	userID := userIDVal.(uuid.UUID)

	var body fcmTokenBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูล fcm_token ไม่ถูกต้อง"})
		return
	}

	err := h.svc.UpdateFcmToken(c.Request.Context(), userID, body.FcmToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":      true,
		"message": "อัปเดต FCM Token สำเร็จ",
	})
}
