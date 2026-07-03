package server

import (
	"fmt"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/config"
	"github.com/Nattamon123/employee/backend/internal/handler"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/internal/service"
)

// Server เก็บ Gin engine และ dependencies ทั้งหมดของระบบ
type Server struct {
	router *gin.Engine
	cfg    *config.Config
}

// New สร้าง Server ใหม่ ต่อ DB, wire dependencies, และลงทะเบียน routes ทั้งหมด
func New(cfg *config.Config) (*Server, error) {
	// --- เชื่อมต่อฐานข้อมูล ---
	db, err := repository.NewDB(cfg.SupabaseDatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("เชื่อมต่อฐานข้อมูลล้มเหลว: %w", err)
	}

	// --- สร้าง Repositories (ชั้นจัดการ SQL) ---
	userRepo := repository.NewUserRepo(db)
	attendanceRepo := repository.NewAttendanceRepo(db)
	leaveRepo := repository.NewLeaveRepo(db)
	leaveQuotaRepo := repository.NewLeaveQuotaRepo(db)
	offsiteRepo := repository.NewOffsiteRepo(db)
	holidayRepo := repository.NewHolidayRepo(db)
	locationRepo := repository.NewLocationRepo(db)

	// --- สร้าง Services (ชั้น Business Logic) ---
	userSvc := service.NewUserService(userRepo)
	attendanceSvc := service.NewAttendanceService(attendanceRepo, locationRepo, offsiteRepo, cfg)
	leaveSvc := service.NewLeaveService(leaveRepo, leaveQuotaRepo)
	offsiteSvc := service.NewOffsiteService(offsiteRepo)
	holidaySvc := service.NewHolidayService(holidayRepo)
	locationSvc := service.NewLocationService(locationRepo)

	// --- สร้าง Handlers (ชั้นรับ HTTP Request) ---
	userH := handler.NewUserHandler(userSvc)
	attendanceH := handler.NewAttendanceHandler(attendanceSvc)
	leaveH := handler.NewLeaveHandler(leaveSvc)
	offsiteH := handler.NewOffsiteHandler(offsiteSvc)
	holidayH := handler.NewHolidayHandler(holidaySvc)
	adminH := handler.NewAdminHandler(userSvc, leaveSvc, offsiteSvc, attendanceSvc, locationSvc)

	// --- สร้าง Router และลงทะเบียน Routes ---
	router := gin.Default()

	// CORS — อนุญาตให้ frontend เรียก API ข้าม origin ได้
	router.Use(cors.New(cors.Config{
		AllowOriginFunc:  func(origin string) bool { return true },
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Accept", "User-Agent", "Cache-Control"},
		AllowCredentials: true,
	}))

	registerRoutes(router, cfg, userSvc, userH, attendanceH, leaveH, offsiteH, holidayH, adminH)

	return &Server{router: router, cfg: cfg}, nil
}

// Run เริ่มต้น HTTP server
func (s *Server) Run() error {
	return s.router.Run(":" + s.cfg.Port)
}

// registerRoutes ลงทะเบียน API endpoints ทั้งหมด แบ่ง 3 กลุ่ม:
// 1. Public   — ไม่ต้อง JWT (สมัครสมาชิก)
// 2. Employee — ต้อง JWT + บัญชี active (เช็คอิน, ลา, ดูวันหยุด)
// 3. Admin    — ต้อง JWT + active + role admin (อนุมัติ, จัดการพนักงาน)
func registerRoutes(
	r *gin.Engine,
	cfg *config.Config,
	userSvc *service.UserService,
	userH *handler.UserHandler,
	attendanceH *handler.AttendanceHandler,
	leaveH *handler.LeaveHandler,
	offsiteH *handler.OffsiteHandler,
	holidayH *handler.HolidayHandler,
	adminH *handler.AdminHandler,
) {
	// ตรวจสอบว่า server ยังทำงานอยู่ (ไม่ต้องล็อกอิน)
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "nexhr-api"})
	})

	// สร้าง KeyManager เพื่อดึงและแคช Public Keys จาก Supabase JWKS (สำหรับยืนยัน ES256 tokens)
	keyManager := middleware.NewKeyManager(cfg.SupabaseURL, cfg.SupabaseAnonKey)

	// ─── เส้นทางสาธารณะ (ไม่ต้องล็อกอิน) ──────────────────
	auth := r.Group("/auth")
	{
		auth.POST("/register", userH.Register) // ล็อกอินครั้งแรก → สร้าง user สถานะ pending
	}

	// ─── เส้นทางพนักงาน (ต้องล็อกอิน + บัญชี active) ──────
	api := r.Group("/api")
	api.Use(middleware.JWTAuth(cfg.SupabaseJWTSecret, keyManager))  // ตรวจ JWT จาก Supabase
	api.Use(LoadUserMiddleware(userSvc))                // ดึงข้อมูล user จาก DB ฝังลง Context
	api.Use(middleware.RequireActive())                   // บล็อคบัญชี pending/disabled
	{
		// ข้อมูลผู้ใช้
		api.GET("/users/me", userH.GetMe)             // ดึงข้อมูลตัวเอง
		api.PUT("/users/me/device", userH.BindDevice) // ผูกเครื่องมือถือ

		// เข้า-ออกงาน
		api.POST("/attendance/checkin", attendanceH.CheckIn)    // เช็คอิน (ตรวจ GPS + Device)
		api.POST("/attendance/checkout", attendanceH.CheckOut)  // เช็คเอาท์
		api.GET("/attendance", attendanceH.GetByDate)            // ดูสถานะวันนี้ ?date=2026-07-02
		api.GET("/attendance/history", attendanceH.History)      // ดูประวัติย้อนหลัง ?month=2026-07

		// ใบลา
		api.POST("/leaves", leaveH.Create)    // ส่งใบลา
		api.GET("/leaves", leaveH.ListMine)   // ดูใบลาของตัวเอง
		api.GET("/leaves/quota", leaveH.GetMyQuota) // ดูโควต้าวันลา

		// ขอออกหน้างาน
		api.POST("/offsite", offsiteH.Create)    // ส่งคำขอออกหน้างาน
		api.GET("/offsite", offsiteH.ListMine)   // ดูคำขอของตัวเอง

		// วันหยุด
		api.GET("/holidays", holidayH.List) // ดูวันหยุดทั้งปี ?year=2026
	}

	// ─── เส้นทางแอดมิน (ต้องล็อกอิน + active + role admin) ─
	admin := r.Group("/admin")
	admin.Use(middleware.JWTAuth(cfg.SupabaseJWTSecret, keyManager))
	admin.Use(LoadUserMiddleware(userSvc))
	admin.Use(middleware.RequireActive())
	admin.Use(middleware.RequireAdmin())
	{
		// จัดการพนักงาน
		admin.GET("/users", adminH.ListUsers)                          // ดูรายชื่อพนักงานทั้งหมด
		admin.GET("/users/:id/history", adminH.GetUserHistory)         // ดึงประวัติรายคน
		admin.GET("/history/monthly", adminH.GetMonthlyHistory)        // ดึงประวัติเข้างานแบบรวมรายเดือน (N+1 fix)
		admin.PUT("/users/:id", adminH.UpdateUser)                     // แก้ไขข้อมูลพนักงาน (Role, Name, etc.)
		admin.PATCH("/users/:id/approve", adminH.ApproveUser)          // อนุมัติบัญชีพนักงาน
		admin.PATCH("/users/:id/disable", adminH.DisableUser)          // ปิดบัญชีพนักงาน
		admin.PATCH("/users/:id/unbind-device", adminH.UnbindDevice)   // ปลดล็อคเครื่องมือถือ
		
		admin.GET("/users/:id/quota", leaveH.GetUserQuota)             // ดูโควต้าวันลาพนักงาน
		admin.PUT("/users/:id/quota", leaveH.UpdateUserQuota)          // อัปเดตโควต้าวันลาพนักงาน

		// อนุมัติคำขอ
		admin.GET("/requests/pending", adminH.GetPendingRequests)          // ดูคำขอที่รออนุมัติ
		admin.GET("/requests/all", adminH.GetAllRequests)                   // ดูคำขอทั้งหมดทุกสถานะ (ประวัติ)
		admin.PATCH("/leaves/:id/status", adminH.UpdateLeaveStatus)        // อนุมัติ/ปฏิเสธใบลา
		admin.PATCH("/offsite/:id/status", adminH.UpdateOffsiteStatus)     // อนุมัติ/ปฏิเสธออกหน้างาน

		// ภาพรวมเข้างาน
		admin.GET("/attendance", adminH.GetAllAttendance)         // ดูสถิติเข้างานทุกคน ?date=2026-07-02
		admin.POST("/attendance/manual", adminH.ManualAttendance) // บันทึกเข้างานด้วยมือ (กรณีพิเศษ)

		// จัดการวันหยุด
		admin.POST("/holidays", holidayH.Create)          // เพิ่มวันหยุด
		admin.DELETE("/holidays/:id", holidayH.Delete)     // ลบวันหยุด

		// จัดการจุดทำงาน (Geofence)
		admin.GET("/locations", adminH.ListLocations)          // ดูจุดทำงานทั้งหมด
		admin.POST("/locations", adminH.CreateLocation)        // เพิ่มจุดทำงาน (สาขาใหม่)
		admin.DELETE("/locations/:id", adminH.DeleteLocation)   // ลบจุดทำงาน
	}
}

// LoadUserMiddleware ดึงข้อมูลผู้ใช้จากฐานข้อมูลด้วย auth_id และฝัง user_id, role, status ลง Context
func LoadUserMiddleware(userSvc *service.UserService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authIDStr, exists := c.Get(middleware.ContextKeyAuthID)
		if !exists {
			c.Next()
			return
		}

		authID, err := uuid.Parse(authIDStr.(string))
		if err != nil {
			c.Next()
			return
		}

		// ดึงข้อมูล User จากฐานข้อมูล
		user, err := userSvc.GetByAuthID(c.Request.Context(), authID)
		if err == nil && user != nil {
			// ฝังข้อมูลลง Context เพื่อให้ Middleware หรือ Handler ถัดไปใช้งานได้
			c.Set(middleware.ContextKeyUserID, user.ID)
			c.Set(middleware.ContextKeyRole, user.Role)
			c.Set(middleware.ContextKeyStatus, user.Status)
		}
		
		c.Next()
	}
}
