package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/config"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/pkg/geo"
)

// AttendanceService เป็น "สมอง" ของระบบเข้างาน
// ทำหน้าที่ตรวจสอบ Geofence, คำนวณสถานะสาย, และสั่งบันทึกข้อมูลลง DB
type AttendanceService struct {
	attendanceRepo *repository.AttendanceRepo
	locationRepo   *repository.LocationRepo
	offsiteRepo    *repository.OffsiteRepo
	userRepo       *repository.UserRepo
	settingRepo    *repository.SettingRepo
	cfg            *config.Config
}

func NewAttendanceService(
	ar *repository.AttendanceRepo,
	lr *repository.LocationRepo,
	or *repository.OffsiteRepo,
	ur *repository.UserRepo,
	sr *repository.SettingRepo,
	cfg *config.Config,
) *AttendanceService {
	return &AttendanceService{
		attendanceRepo: ar,
		locationRepo:   lr,
		offsiteRepo:    or,
		userRepo:       ur,
		settingRepo:    sr,
		cfg:            cfg,
	}
}

// CheckInRequest ข้อมูลที่ Client ส่งมาตอนเช็คอิน
type CheckInRequest struct {
	UserID     uuid.UUID
	Lat        float64
	Lng        float64
	PhotoURL   *string
	DeviceID   string // Device UUID ที่ส่งมาจากแอป (ใช้ตรวจ Device Binding)
	FaceVector *string
}

// CheckIn ดำเนินการเช็คอินเข้างาน
// ขั้นตอน: ตรวจซ้ำ → ตรวจ Geofence (ถ้าไม่ใช่ Offsite) → คำนวณสาย → บันทึก
func (s *AttendanceService) CheckIn(ctx context.Context, req CheckInRequest) (*domain.Attendance, error) {
	now := time.Now()                            // ⚡ ใช้เวลาของ Server เสมอ ห้ามเชื่อ Client
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// 1. ตรวจว่าเช็คอินซ้ำหรือยัง
	existing, _ := s.attendanceRepo.FindByUserAndDate(ctx, req.UserID, today)
	if existing != nil {
		return nil, errors.New("คุณเช็คอินวันนี้ไปแล้ว")
	}

	// 1.5 ตรวจใบหน้า (Face Matching) เฉพาะเมื่อโหมดเช็คอินเป็น "face" เท่านั้น
	checkInMode := "face"
	if s.settingRepo != nil {
		if val, err := s.settingRepo.Get(ctx, "checkin_mode"); err == nil && val != "" {
			checkInMode = val
		}
	}

	if checkInMode == "face" {
		if req.FaceVector == nil || *req.FaceVector == "" {
			return nil, errors.New("ไม่พบข้อมูลใบหน้า กรุณาสแกนใบหน้าเพื่อเช็คอิน")
		}
		distance, err := s.userRepo.CompareFaceDistance(ctx, req.UserID, *req.FaceVector)
		if err != nil {
			// ถ้า err แสดงว่าไม่มี face_embedding ในฐานข้อมูล
			return nil, errors.New("กรุณาลงทะเบียนใบหน้าก่อนทำการเช็คอิน")
		}
		if distance > 0.75 {
			return nil, errors.New("ใบหน้าไม่ตรงกับที่ลงทะเบียนไว้")
		}
	}

	// 2. ตรวจ Geofence (ADR 0004)
	// ถ้ามีคำขอออกหน้างานที่อนุมัติแล้ว → ข้าม Geofence (ADR 0005)
	isOffsite, err := s.offsiteRepo.HasApprovedForDate(ctx, req.UserID, today)
	if err != nil {
		return nil, fmt.Errorf("ตรวจสอบสถานะออกหน้างานล้มเหลว: %w", err)
	}

	var matchedLocationID *uuid.UUID
	if !isOffsite {
		// ดึงจุดทำงานทั้งหมดที่ใช้งานอยู่
		locations, err := s.locationRepo.ListActive(ctx)
		if err != nil {
			return nil, fmt.Errorf("ดึงข้อมูลจุดทำงานล้มเหลว: %w", err)
		}

		if len(locations) == 0 {
			return nil, errors.New("ยังไม่มีจุดทำงานในระบบ กรุณาแจ้งแอดมินเพิ่มจุดทำงานก่อน")
		}

		// ตรวจว่าพนักงานอยู่ภายในรัศมีของจุดทำงานไหนหรือไม่
		for _, loc := range locations {
			if geo.IsWithinRadius(loc.Latitude, loc.Longitude, req.Lat, req.Lng, float64(loc.RadiusM)) {
				locID := loc.ID
				matchedLocationID = &locID
				break
			}
		}
	}

	// 3. คำนวณสถานะสาย (หลัง 09:00 = สาย)
	isPastLateHour := now.Hour() > s.cfg.LateThresholdHour
	isAtLateHourButPastMinute := now.Hour() == s.cfg.LateThresholdHour && now.Minute() > s.cfg.LateThresholdMinute
	isLate := isPastLateHour || isAtLateHourButPastMinute

	status := "on_time"
	if isOffsite {
		status = "offsite"
	} else if isLate {
		status = "late"
	}

	// 4. บันทึกลง DB
	att := &domain.Attendance{
		ID:            uuid.New(),
		UserID:        req.UserID,
		Date:          today,
		CheckInAt:     &now,
		Status:        status,
		CheckInLat:    &req.Lat,
		CheckInLng:    &req.Lng,
		CheckInPhoto:  req.PhotoURL,
		LocationID:    matchedLocationID,
	}

	if err := s.attendanceRepo.CreateCheckIn(ctx, att); err != nil {
		return nil, fmt.Errorf("บันทึกเช็คอินล้มเหลว: %w", err)
	}

	return att, nil
}

// ListByMonthAllUsers (Admin)
func (s *AttendanceService) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.Attendance, error) {
	return s.attendanceRepo.ListByMonthAllUsers(ctx, year, month)
}

// CheckOutRequest ข้อมูลที่ Client ส่งมาตอนออกงานเช็คเอาท์
type CheckOutRequest struct {
	UserID   uuid.UUID
	Lat      *float64
	Lng      *float64
	PhotoURL *string
}

// CheckOut ดำเนินการเช็คเอาท์ออกงาน
func (s *AttendanceService) CheckOut(ctx context.Context, req CheckOutRequest) (*domain.Attendance, error) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// ดึงบันทึกเข้างานของวันนี้
	att, err := s.attendanceRepo.FindByUserAndDate(ctx, req.UserID, today)
	if err != nil {
		return nil, errors.New("ไม่พบบันทึกเช็คอินของวันนี้ กรุณาเช็คอินก่อน")
	}

	if att.CheckOutAt != nil {
		return nil, errors.New("คุณเช็คเอาท์วันนี้ไปแล้ว")
	}

	// อัปเดตเวลาเช็คเอาท์ (ใช้เวลา Server)
	if err := s.attendanceRepo.UpdateCheckOut(ctx, att.ID, now, req.Lat, req.Lng, req.PhotoURL); err != nil {
		return nil, fmt.Errorf("บันทึกเช็คเอาท์ล้มเหลว: %w", err)
	}

	att.CheckOutAt = &now
	return att, nil
}

// GetByDate ดึงบันทึกเข้างานของ user ในวันที่ระบุ
func (s *AttendanceService) GetByDate(ctx context.Context, userID uuid.UUID, date time.Time) (*domain.Attendance, error) {
	return s.attendanceRepo.FindByUserAndDate(ctx, userID, date)
}

// History ดึงประวัติเข้างานทั้งเดือน
func (s *AttendanceService) History(ctx context.Context, userID uuid.UUID, year, month int) ([]domain.Attendance, error) {
	return s.attendanceRepo.ListByUserAndMonth(ctx, userID, year, month)
}

// GetAllByDate ดึงบันทึกเข้างานของทุกคนในวันนั้น (สำหรับ Admin)
func (s *AttendanceService) GetAllByDate(ctx context.Context, date time.Time) ([]domain.Attendance, error) {
	return s.attendanceRepo.ListByDate(ctx, date)
}

// ListByUser ดึงประวัติเข้างานทั้งหมดของ user (สำหรับ Admin)
func (s *AttendanceService) ListByUser(ctx context.Context, userID uuid.UUID) ([]domain.Attendance, error) {
	return s.attendanceRepo.ListByUser(ctx, userID)
}

// CreateManual บันทึกเข้างานด้วยมือโดยแอดมิน (กรณีพิเศษ เช่น ลืมสแกน หรือเครื่องมีปัญหา)
func (s *AttendanceService) CreateManual(ctx context.Context, userID uuid.UUID, date time.Time, status string) (*domain.Attendance, error) {
	// ล้างค่าเวลาให้เป็น 00:00:00 สำหรับวันที่ระบุ (ใช้ Local timezone)
	loc := time.Local
	targetDate := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, loc)

	// เช็คว่ามีบันทึกอยู่แล้วหรือไม่
	existing, _ := s.attendanceRepo.FindByUserAndDate(ctx, userID, targetDate)
	if existing != nil {
		return nil, errors.New("มีบันทึกการเข้างานของพนักงานในวันดังกล่าวแล้ว")
	}

	var checkInTime *time.Time
	now := time.Now()
	todayDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	// ห้ามบันทึก "ตรงเวลา" หรือ "มาสาย" ล่วงหน้า
	if targetDate.After(todayDate) && (status == "on_time" || status == "late") {
		return nil, errors.New("ไม่สามารถบันทึกสถานะ 'ตรงเวลา' หรือ 'มาสาย' สำหรับวันในอนาคตได้")
	}
	
	// ตั้งเวลา CheckInAt เฉพาะการเข้างานจริงๆ เท่านั้น (ไม่รวมการลาต่างๆ)
	if status == "on_time" || status == "late" || status == "offsite" {
		var t time.Time
		// ถ้าแอดมินบันทึกของ "วันนี้" ให้ใช้เวลาปัจจุบัน
		if targetDate.Equal(todayDate) {
			t = now
		} else {
			// ถ้าเป็นของย้อนหลังหรือล่วงหน้า สมมติเวลาให้ตามสถานะ (Local timezone)
			hour, minute := 9, 0
			if status == "late" {
				hour, minute = 9, 30
			}
			t = time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, loc)
		}
		checkInTime = &t
	}

	att := &domain.Attendance{
		ID:        uuid.New(),
		UserID:    userID,
		Date:      targetDate,
		CheckInAt: checkInTime,
		Status:    status,
	}

	if err := s.attendanceRepo.CreateCheckIn(ctx, att); err != nil {
		return nil, fmt.Errorf("บันทึกเข้างานด้วยมือล้มเหลว: %w", err)
	}

	return att, nil
}

type TodaySummary struct {
	TotalEmployees int `json:"total_employees"`
	AttendedToday  int `json:"attended_today"`
	LateToday      int `json:"late_today"`
}

func (s *AttendanceService) GetTodaySummary(ctx context.Context, date time.Time) (int, int, int, error) {
	users, err := s.userRepo.ListAll(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	totalActive := 0
	for _, u := range users {
		if u.Status == "active" {
			totalActive++
		}
	}

	records, err := s.attendanceRepo.ListByDate(ctx, date)
	if err != nil {
		return 0, 0, 0, err
	}

	attended := 0
	late := 0
	for _, r := range records {
		if r.Status == "on_time" || r.Status == "late" || r.Status == "half_day" || r.Status == "offsite" {
			attended++
		}
		if r.Status == "late" {
			late++
		}
	}

	return totalActive, attended, late, nil
}

