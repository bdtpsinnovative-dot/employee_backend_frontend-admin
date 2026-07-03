package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

const baseURL = "http://localhost:8080"

var (
	jwtSecret string
	dbURL     string
)

func main() {
	fmt.Println("🚀 เริ่มรัน API Integration Tests...")

	if err := godotenv.Load(".env"); err != nil {
		if err := godotenv.Load("backend/.env"); err != nil {
			fmt.Println("⚠️ ไม่พบไฟล์ .env หรือโหลดไม่สำเร็จ (อาจจะใช้ environment variable ที่มีอยู่แล้ว)")
		}
	}
	jwtSecret = os.Getenv("SUPABASE_JWT_SECRET")
	dbURL = os.Getenv("SUPABASE_DATABASE_URL")

	if jwtSecret == "" || dbURL == "" {
		fmt.Println("❌ ขาด SUPABASE_JWT_SECRET หรือ SUPABASE_DATABASE_URL")
		return
	}

	// สร้างข้อมูลสุ่มเพื่อไม่ให้ซ้ำ
	adminAuthID := uuid.New()
	employeeAuthID := uuid.New()
	adminToken := generateToken(adminAuthID.String())
	employeeToken := generateToken(employeeAuthID.String())
	uniqueSuffix := time.Now().Unix()

	// 1. ทดสอบลงทะเบียนพนักงาน (Employee)
	fmt.Println("\n--- 📝 1. ทดสอบลงทะเบียนพนักงาน ---")
	sendRequest("POST", "/auth/register", employeeToken, map[string]string{
		"auth_id":    employeeAuthID.String(),
		"email":      fmt.Sprintf("employee_%d@example.com", uniqueSuffix),
		"first_name": "สมชาย",
		"last_name":  "ใจดี",
	})

	// 2. ทดสอบลงทะเบียน Admin 
	fmt.Println("\n--- 📝 2. ทดสอบลงทะเบียน Admin ---")
	sendRequest("POST", "/auth/register", adminToken, map[string]string{
		"auth_id":    adminAuthID.String(),
		"email":      fmt.Sprintf("admin_%d@example.com", uniqueSuffix),
		"first_name": "แอดมิน",
		"last_name":  "สูงสุด",
	})

	// 3. ปรับสถานะบัญชีให้เป็น Active และ Admin ผ่าน Database โดยตรง
	fmt.Println("\n--- 🔧 3. บังคับอัปเดตสถานะ User เป็น Active (ผ่าน DB) ---")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		fmt.Println("❌ เชื่อมต่อ DB ไม่สำเร็จ:", err)
		return
	}
	defer db.Close()
	
	_, err = db.Exec("UPDATE users SET status = 'active' WHERE auth_id = $1", employeeAuthID)
	if err != nil {
		fmt.Println("❌ อัปเดต Employee ล้มเหลว:", err)
	}
	_, err = db.Exec("UPDATE users SET status = 'active', role = 'admin' WHERE auth_id = $1", adminAuthID)
	if err != nil {
		fmt.Println("❌ อัปเดต Admin ล้มเหลว:", err)
	}

	// 4. ทดสอบผูกอุปกรณ์ (Device Binding)
	fmt.Println("\n--- 📱 4. ทดสอบผูกอุปกรณ์ (Device Binding) ---")
	sendRequest("PUT", "/api/users/me/device", employeeToken, map[string]string{
		"device_id": "DEVICE-IPHONE-15-PRO-MAX",
	})
	
	// 5. ทดสอบ Check-In (กรณีพิกัดสมมติ)
	fmt.Println("\n--- 📍 5. ทดสอบเช็คอิน (Check-In) ---")
	sendRequest("POST", "/api/attendance/checkin", employeeToken, map[string]interface{}{
		"lat":       13.7563, 
		"lng":       100.5018,
		"photo_url": "https://example.com/face.jpg",
		"device_id": "DEVICE-IPHONE-15-PRO-MAX",
	})

	// 6. ทดสอบ Check-Out
	fmt.Println("\n--- 🏃 6. ทดสอบเช็คเอาท์ (Check-Out) ---")
	sendRequest("POST", "/api/attendance/checkout", employeeToken, map[string]interface{}{
		"lat": 13.7563,
		"lng": 100.5018,
	})

	// 7. ทดสอบขอใบลา
	fmt.Println("\n--- 📝 7. ทดสอบส่งใบลา (Leave Request) ---")
	sendRequest("POST", "/api/leaves", employeeToken, map[string]interface{}{
		"leave_type": "ลาป่วย",
		"date":       time.Now().Format("2006-01-02"),
		"duration":   "เต็มวัน",
		"reason":     "เป็นไข้หวัด",
	})

	// 8. ทดสอบ API แอดมินดูรายชื่อผู้ใช้
	fmt.Println("\n--- 👑 8. ทดสอบ API Admin (ดึงรายชื่อผู้ใช้) ---")
	sendRequest("GET", "/admin/users", adminToken, nil)

	fmt.Println("\n✅ ทดสอบเสร็จสิ้น!")
}

// generateToken จำลอง JWT ที่ออกจาก Supabase
func generateToken(sub string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":  sub,
		"role": "authenticated",
		"exp":  time.Now().Add(time.Hour).Unix(),
	})
	tokenString, _ := token.SignedString([]byte(jwtSecret))
	return tokenString
}

// sendRequest ยิง HTTP Request และ print ผลลัพธ์
func sendRequest(method, path, token string, body interface{}) map[string]interface{} {
	var reqBody io.Reader
	if body != nil {
		jsonBody, _ := json.Marshal(body)
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, _ := http.NewRequest(method, baseURL+path, reqBody)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("❌ Error calling %s: %v\n", path, err)
		return nil
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	fmt.Printf("[%d] %s %s\nResponse: %s\n", resp.StatusCode, method, path, string(respBody))

	var result map[string]interface{}
	json.Unmarshal(respBody, &result)
	return result
}
