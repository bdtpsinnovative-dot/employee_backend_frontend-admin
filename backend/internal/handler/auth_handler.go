package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AuthHandler เป็นตัวกลางระหว่างแอปกับ Supabase Auth
// เพื่อไม่ให้แอปต้องเก็บ Supabase URL หรือ API key
type AuthHandler struct {
	supabaseURL string
	anonKey     string
	httpClient  *http.Client
}

func NewAuthHandler(supabaseURL, anonKey string) *AuthHandler {
	return &AuthHandler{
		supabaseURL: strings.TrimRight(supabaseURL, "/"),
		anonKey:     anonKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type authCredentials struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// SignUp POST /auth/signup
func (h *AuthHandler) SignUp(c *gin.Context) {
	h.forwardPasswordRequest(c, "/auth/v1/signup")
}

// Login POST /auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	h.forwardPasswordRequest(c, "/auth/v1/token?grant_type=password")
}

func (h *AuthHandler) forwardPasswordRequest(c *gin.Context, path string) {
	if h.supabaseURL == "" || h.anonKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ระบบยืนยันตัวตนยังไม่ได้ตั้งค่า",
		})
		return
	}

	var body authCredentials
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร",
		})
		return
	}

	requestBody, err := json.Marshal(body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เตรียมข้อมูลไม่สำเร็จ"})
		return
	}

	req, err := http.NewRequestWithContext(
		c.Request.Context(),
		http.MethodPost,
		h.supabaseURL+path,
		bytes.NewReader(requestBody),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างคำขอไม่สำเร็จ"})
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", h.anonKey)
	req.Header.Set("Authorization", "Bearer "+h.anonKey)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "เชื่อมต่อระบบยืนยันตัวตนไม่ได้ กรุณาลองใหม่",
		})
		return
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "อ่านผลการยืนยันตัวตนไม่ได้"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "รูปแบบข้อมูลยืนยันตัวตนไม่ถูกต้อง"})
		return
	}

	if resp.StatusCode >= http.StatusBadRequest {
		c.JSON(resp.StatusCode, gin.H{"error": authErrorMessage(payload)})
		return
	}

	// ส่งเฉพาะผลลัพธ์จาก Supabase Auth กลับไปให้แอป
	// เช่น access_token, refresh_token, expires_in และ user
	c.JSON(resp.StatusCode, payload)
}

func authErrorMessage(payload map[string]interface{}) string {
	for _, key := range []string{"msg", "error_description", "message", "error"} {
		if value, ok := payload[key].(string); ok && value != "" {
			return value
		}
	}
	return "ยืนยันตัวตนไม่สำเร็จ กรุณาลองใหม่"
}
