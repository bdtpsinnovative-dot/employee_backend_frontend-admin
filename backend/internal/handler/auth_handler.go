package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
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
			Timeout: 35 * time.Second,
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
			"error": "ระบบยืนยันตัวตนยังไม่ได้ตั้งค่า (SUPABASE_URL หรือ SUPABASE_ANON_KEY ขาดหาย)",
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

	targetURL := h.supabaseURL + path
	log.Printf("[AUTH] Forwarding request to: %s", targetURL)

	var resp *http.Response
	var reqErr error

	// ลองส่ง request สูงสุด 2 ครั้ง (กรณี Supabase Cold Start / Network Jitter)
	for attempt := 1; attempt <= 2; attempt++ {
		req, err := http.NewRequestWithContext(
			c.Request.Context(),
			http.MethodPost,
			targetURL,
			bytes.NewReader(requestBody),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างคำขอไม่สำเร็จ"})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("apikey", h.anonKey)
		req.Header.Set("Authorization", "Bearer "+h.anonKey)

		resp, reqErr = h.httpClient.Do(req)
		if reqErr == nil {
			break
		}

		log.Printf("[AUTH WARN] Attempt %d failed to reach Supabase: %v", attempt, reqErr)
		if attempt < 2 {
			select {
			case <-c.Request.Context().Done():
				c.JSON(http.StatusRequestTimeout, gin.H{"error": "คำขอยกเลิกหรือหมดเวลา"})
				return
			case <-time.After(500 * time.Millisecond):
			}
		}
	}

	if reqErr != nil {
		log.Printf("[AUTH ERROR] All attempts failed to connect to Supabase (%s): %v", targetURL, reqErr)
		c.JSON(http.StatusBadGateway, gin.H{
			"error": "เชื่อมต่อระบบยืนยันตัวตน (Supabase) ไม่ได้: เซิร์ฟเวอร์ปลายทางไม่ตอบสนอง กรุณาลองใหม่อีกครั้ง",
		})
		return
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("[AUTH ERROR] Failed to read Supabase response: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "อ่านผลการยืนยันตัวตนไม่ได้"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		log.Printf("[AUTH ERROR] Invalid JSON from Supabase (status %d): %s", resp.StatusCode, string(responseBody))
		c.JSON(http.StatusBadGateway, gin.H{"error": "รูปแบบข้อมูลยืนยันตัวตนไม่ถูกต้อง"})
		return
	}

	if resp.StatusCode >= http.StatusBadRequest {
		errMsg := authErrorMessage(payload)
		log.Printf("[AUTH WARN] Supabase returned status %d: %s", resp.StatusCode, errMsg)
		c.JSON(resp.StatusCode, gin.H{"error": errMsg})
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
