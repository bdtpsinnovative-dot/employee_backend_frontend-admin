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

type refreshTokenCredentials struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// RefreshToken POST /auth/refresh
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	if h.supabaseURL == "" || h.anonKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "ระบบยืนยันตัวตนยังไม่ได้ตั้งค่า (SUPABASE_URL หรือ SUPABASE_ANON_KEY ขาดหาย)",
		})
		return
	}

	var body refreshTokenCredentials
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "กรุณาระบุ refresh_token",
		})
		return
	}

	requestBody, err := json.Marshal(body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "เตรียมข้อมูลไม่สำเร็จ"})
		return
	}

	targetURL := h.supabaseURL + "/auth/v1/token?grant_type=refresh_token"
	log.Printf("[AUTH] Forwarding refresh token request to: %s", targetURL)

	var resp *http.Response
	var reqErr error

	// ลองส่ง request สูงสุด 3 ครั้ง (กรณี Supabase Cold Start / Network Jitter)
	for attempt := 1; attempt <= 3; attempt++ {
		req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, targetURL, bytes.NewReader(requestBody))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "สร้างคำขอไม่สำเร็จ"})
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("apikey", h.anonKey)
		req.Header.Set("Authorization", "Bearer "+h.anonKey)

		resp, reqErr = h.httpClient.Do(req)
		if reqErr == nil {
			if resp.StatusCode < http.StatusInternalServerError && resp.StatusCode != http.StatusTooManyRequests {
				break
			}
			if attempt == 3 {
				break
			}
			_ = resp.Body.Close()
		}

		if reqErr != nil {
			log.Printf("[AUTH WARN] Refresh attempt %d failed to reach Supabase: %v", attempt, reqErr)
		} else {
			log.Printf("[AUTH WARN] Refresh attempt %d received transient status %d", attempt, resp.StatusCode)
		}
		if attempt < 3 {
			select {
			case <-c.Request.Context().Done():
				c.JSON(http.StatusRequestTimeout, gin.H{"error": "คำขอยกเลิกหรือหมดเวลา"})
				return
			case <-time.After(time.Duration(attempt*250) * time.Millisecond):
			}
		}
	}

	if reqErr != nil || resp == nil {
		log.Printf("[AUTH ERROR] All attempts to refresh token failed: %v", reqErr)
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":            "เชื่อมต่อระบบยืนยันตัวตน (Supabase) ไม่ได้: เครือข่ายขัดข้อง",
			"is_invalid_grant": false,
		})
		return
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "อ่านผลการต่ออายุ Token ไม่ได้"})
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(responseBody, &payload); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":            "รูปแบบข้อมูลจากระบบยืนยันตัวตนไม่ถูกต้อง",
			"is_invalid_grant": false,
		})
		return
	}

	if resp.StatusCode >= http.StatusBadRequest {
		errMsg := authErrorMessage(payload)
		if isInvalidRefreshGrant(payload) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":            errMsg,
				"error_code":       authErrorCode(payload),
				"is_invalid_grant": true,
			})
			return
		}

		// Unknown 4xx, rate limits, and upstream 5xx are treated as temporary.
		// This prevents clients from deleting a valid local session on a glitch.
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error":            errMsg,
			"error_code":       authErrorCode(payload),
			"is_invalid_grant": false,
		})
		return
	}

	c.JSON(resp.StatusCode, payload)
}

func authErrorCode(payload map[string]interface{}) string {
	for _, key := range []string{"error_code", "code"} {
		if value, ok := payload[key].(string); ok && value != "" {
			return strings.ToLower(value)
		}
	}
	return ""
}

func isInvalidRefreshGrant(payload map[string]interface{}) bool {
	switch authErrorCode(payload) {
	case "refresh_token_not_found", "refresh_token_already_used", "invalid_credentials":
		return true
	}

	// Older/self-hosted GoTrue versions may not include an error code.
	for _, key := range []string{"error", "error_description"} {
		if value, ok := payload[key].(string); ok {
			normalized := strings.ToLower(value)
			if normalized == "invalid_grant" ||
				strings.Contains(normalized, "refresh token not found") ||
				strings.Contains(normalized, "refresh token already used") {
				return true
			}
		}
	}
	return false
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
