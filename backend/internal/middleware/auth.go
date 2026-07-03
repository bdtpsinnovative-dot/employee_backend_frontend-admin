package middleware

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWK represents a JSON Web Key for token verification
type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

// JWKS holds a list of JSON Web Keys
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// KeyManager handles fetching and caching public keys from Supabase JWKS
type KeyManager struct {
	jwksURL     string
	apiKey      string
	keys        map[string]*ecdsa.PublicKey
	mu          sync.RWMutex
	lastFetched time.Time
}

// NewKeyManager creates a new key manager for verifying ES256 tokens
func NewKeyManager(supabaseURL, apiKey string) *KeyManager {
	return &KeyManager{
		jwksURL: supabaseURL + "/auth/v1/.well-known/jwks.json",
		apiKey:  apiKey,
		keys:    make(map[string]*ecdsa.PublicKey),
	}
}

// GetPublicKey retrieves the public key matching the given Key ID (kid)
func (km *KeyManager) GetPublicKey(kid string) (*ecdsa.PublicKey, error) {
	km.mu.RLock()
	key, exists := km.keys[kid]
	lastFetched := km.lastFetched
	km.mu.RUnlock()

	if !exists || time.Since(lastFetched) > 1*time.Hour {
		if err := km.FetchKeys(); err != nil {
			if exists {
				return key, nil
			}
			return nil, err
		}

		km.mu.RLock()
		key, exists = km.keys[kid]
		km.mu.RUnlock()
		if !exists {
			return nil, fmt.Errorf("key id %s not found in JWKS", kid)
		}
	}
	return key, nil
}

// FetchKeys downloads the JWKS keys from Supabase and parses them into ECDSA public keys
func (km *KeyManager) FetchKeys() error {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", km.jwksURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", km.apiKey)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to fetch JWKS, status: %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return err
	}

	newKeys := make(map[string]*ecdsa.PublicKey)
	for _, key := range jwks.Keys {
		if key.Kty != "EC" || key.Crv != "P-256" || key.Alg != "ES256" {
			continue
		}

		xBytes, err := base64.RawURLEncoding.DecodeString(key.X)
		if err != nil {
			continue
		}
		yBytes, err := base64.RawURLEncoding.DecodeString(key.Y)
		if err != nil {
			continue
		}

		pubKey := &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}
		newKeys[key.Kid] = pubKey
	}

	km.mu.Lock()
	km.keys = newKeys
	km.lastFetched = time.Now()
	km.mu.Unlock()

	return nil
}

// ContextKey เก็บชื่อ key ที่ใช้ฝังข้อมูลลง gin.Context
const (
	ContextKeyAuthID = "auth_id" // UUID ของ user จาก Supabase Auth (JWT sub claim)
	ContextKeyRole   = "role"    // สิทธิ์ของ user (employee/admin) — ถูกเซ็ตหลังจากดึงข้อมูลจาก DB
	ContextKeyUserID = "user_id" // UUID ของ user ในตาราง public.users
	ContextKeyStatus = "status"  // สถานะบัญชี (pending/active/disabled)
)

// JWTAuth ตรวจสอบ JWT ที่ส่งมาจาก Client ผ่าน Header: Authorization: Bearer <token>
func JWTAuth(jwtSecret string, keyManager *KeyManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		// ดึง token จาก Header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "กรุณาล็อกอินก่อนใช้งาน"})
			return
		}

		// ตัด "Bearer " ออก เหลือแค่ token
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "รูปแบบ Authorization Header ไม่ถูกต้อง"})
			return
		}

		// ตรวจสอบ JWT
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			// รองรับ ES256 (Supabase Auth จริง)
			if t.Method.Alg() == "ES256" {
				kid, ok := t.Header["kid"].(string)
				if !ok || kid == "" {
					return nil, fmt.Errorf("missing kid header for ES256 token")
				}
				pubKey, err := keyManager.GetPublicKey(kid)
				if err != nil {
					return nil, fmt.Errorf("failed to get public key for kid %s: %w", kid, err)
				}
				return pubKey, nil
			}

			// รองรับ HS256 (สำหรับเทส/ local token)
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			log.Printf("[JWT Error] Token parsing/validation failed: %v (Token valid: %t)", err, token != nil && token.Valid)
			log.Printf("[JWT Info] Secret used (len: %d)", len(jwtSecret))
			log.Printf("[JWT Debug] Raw Token: %s", tokenStr)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token หมดอายุหรือไม่ถูกต้อง กรุณาล็อกอินใหม่"})
			return
		}

		// ดึง sub claim (auth_id จาก Supabase Auth)
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "ไม่สามารถอ่านข้อมูลจาก Token ได้"})
			return
		}

		authID, ok := claims["sub"].(string)
		if !ok || authID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Token ไม่มีข้อมูล user"})
			return
		}

		// ฝัง auth_id ลง Context เพื่อให้ middleware/handler ถัดไปใช้ได้
		c.Set(ContextKeyAuthID, authID)
		c.Next()
	}
}

// RequireActive ตรวจสอบว่าบัญชีของ user ถูก Admin อนุมัติแล้ว (status = "active")
// Middleware นี้ต้องทำงานหลัง JWTAuth เสมอ (เพราะต้องใช้ auth_id จาก Context)
// หมายเหตุ: ข้อมูล user จะถูกดึงจาก DB ใน handler/user_handler.go
// แล้วฝัง role, status, user_id ลง Context ก่อนถึง middleware นี้
func RequireActive() gin.HandlerFunc {
	return func(c *gin.Context) {
		status, exists := c.Get(ContextKeyStatus)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "ไม่พบข้อมูลผู้ใช้ในระบบ",
			})
			return
		}

		if status != "active" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "บัญชีของคุณยังไม่ได้รับการอนุมัติจากแอดมิน กรุณารอการอนุมัติ",
			})
			return
		}
		c.Next()
	}
}

// RequireAdmin ตรวจสอบว่า user มีสิทธิ์ admin
// ต้องทำงานหลัง RequireActive เสมอ
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(ContextKeyRole)
		if !exists || role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ ต้องเป็นแอดมินเท่านั้น",
			})
			return
		}
		c.Next()
	}
}
