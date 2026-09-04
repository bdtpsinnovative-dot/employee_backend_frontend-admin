package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Nattamon123/employee/backend/internal/config"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/pkg/geo"
	"github.com/google/uuid"
)

// AttendanceService เป็น "สมอง" ของระบบเข้างาน
// ทำหน้าที่ตรวจสอบ Geofence, คำนวณสถานะสาย, และสั่งบันทึกข้อมูลลง DB
type AttendanceService struct {
	attendanceRepo *repository.AttendanceRepo
	locationRepo   *repository.LocationRepo
	offsiteRepo    *repository.OffsiteRepo
	holidayRepo    *repository.HolidayRepo
	userRepo       *repository.UserRepo
	settingRepo    *repository.SettingRepo
	cfg            *config.Config
}

func NewAttendanceService(
	ar *repository.AttendanceRepo,
	lr *repository.LocationRepo,
	or *repository.OffsiteRepo,
	hr *repository.HolidayRepo,
	ur *repository.UserRepo,
	sr *repository.SettingRepo,
	cfg *config.Config,
) *AttendanceService {
	return &AttendanceService{
		attendanceRepo: ar,
		locationRepo:   lr,
		offsiteRepo:    or,
		holidayRepo:    hr,
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
	AccuracyM  *float64
}

// CheckIn ดำเนินการเช็คอินเข้างาน
// ขั้นตอน: ตรวจซ้ำ → ตรวจ Geofence (ถ้าไม่ใช่ Offsite) → คำนวณสาย → บันทึก
func (s *AttendanceService) CheckIn(ctx context.Context, req CheckInRequest) (*domain.Attendance, error) {
	now := time.Now() // ⚡ ใช้เวลาของ Server เสมอ ห้ามเชื่อ Client
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	// 1. ตรวจว่าเช็คอินซ้ำหรือยัง
	existing, _ := s.attendanceRepo.FindByUserAndDate(ctx, req.UserID, today)
	if existing != nil {
		return nil, errors.New("คุณเช็คอินวันนี้ไปแล้ว")
	}
	if req.AccuracyM != nil && (*req.AccuracyM <= 0 || *req.AccuracyM > 10000) {
		return nil, errors.New("GPS ยังไม่แม่นยำ กรุณาออกไปยังบริเวณเปิดและลองอีกครั้ง")
	}

	user, err := s.userRepo.FindByID(ctx, req.UserID)
	if err != nil {
		return nil, errors.New("ไม่พบข้อมูลผู้ใช้")
	}

	// 1.5 ยกเลิกการตรวจใบหน้า (Face Matching) ตามนโยบายใหม่ที่เน้นถ่ายรูป/GPS
	// ข้ามขั้นตอน CompareFaceDistance เพื่อลด Egress และไม่บังคับสแกนหน้า

	// 2. Always check real office locations first. Approved offsite is only a
	// fallback when the employee is outside every active office.
	locations, err := s.locationRepo.ListActive(ctx)
	if err != nil {
		return nil, fmt.Errorf("ดึงข้อมูลจุดทำงานล้มเหลว: %w", err)
	}
	approvedOffsite, err := s.offsiteRepo.HasApprovedForDate(ctx, req.UserID, today)
	if err != nil {
		return nil, fmt.Errorf("ตรวจสอบสถานะออกหน้างานล้มเหลว: %w", err)
	}

	var matchedLocationID *uuid.UUID
	locationName := ""
	var distanceM *float64
	closest, closestDistance := closestWorkLocation(locations, req.Lat, req.Lng)
	isInsideOffice := closest != nil && closestDistance <= float64(closest.RadiusM)
	if isInsideOffice {
		locID := closest.ID
		matchedLocationID = &locID
		locationName = closest.Name
		distanceM = &closestDistance
	} else if approvedOffsite {
		addr := reverseGeocode(req.Lat, req.Lng)
		if addr != "" {
			locationName = fmt.Sprintf("ออกหน้างาน (%s)", addr)
		} else {
			locationName = "ออกหน้างาน"
		}
		if closest != nil {
			distanceM = &closestDistance
		}
	} else {
		if closest != nil {
			distanceM = &closestDistance
		}
		addr := reverseGeocode(req.Lat, req.Lng)
		if addr != "" {
			locationName = fmt.Sprintf("นอกพื้นที่ (%s)", addr)
		} else {
			locationName = "นอกพื้นที่"
		}
	}

	// 3. Calculate lateness from the employee's own schedule. Seconds are
	// intentionally ignored: 08:00:59 is on time, 08:01:00 is one minute late.
	workStart, workEnd := s.userWorkSchedule(user)
	isWorkday, err := s.isWorkday(ctx, today)
	if err != nil {
		return nil, fmt.Errorf("ตรวจสอบวันหยุดล้มเหลว: %w", err)
	}
	lateMinutes := 0
	if isWorkday {
		lateMinutes = minutesLate(now, workStart)
	}

	status := "on_time"
	if lateMinutes > 0 {
		status = "late"
	}

	// 4. บันทึกลง DB
	att := &domain.Attendance{
		ID:               uuid.New(),
		UserID:           req.UserID,
		Date:             today,
		CheckInAt:        &now,
		Status:           status,
		CheckInLat:       &req.Lat,
		CheckInLng:       &req.Lng,
		CheckInPhoto:     req.PhotoURL,
		LocationID:       matchedLocationID,
		WorkStartTime:    workStart,
		WorkEndTime:      workEnd,
		IsWorkday:        isWorkday,
		IsOffsite:        !isInsideOffice && approvedOffsite,
		LateMinutes:      lateMinutes,
		LocationName:     locationName,
		CheckInDistanceM: distanceM,
		CheckInAccuracyM: req.AccuracyM,
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
	UserID    uuid.UUID
	Lat       *float64
	Lng       *float64
	PhotoURL  *string
	AccuracyM *float64
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

	att.CheckOutAt = &now
	att.CheckOutLat = req.Lat
	att.CheckOutLng = req.Lng
	att.CheckOutPhoto = req.PhotoURL
	att.CheckOutAccuracyM = req.AccuracyM
	att.CheckOutLocationName = "ไม่สามารถระบุตำแหน่ง"

	// Checkout is never blocked by geofence. When GPS is available, record the
	// nearest area for history and audit purposes.
	if req.Lat != nil && req.Lng != nil {
		locations, listErr := s.locationRepo.ListActive(ctx)
		if listErr != nil {
			return nil, fmt.Errorf("ดึงข้อมูลจุดทำงานล้มเหลว: %w", listErr)
		}
		closest, distance := closestWorkLocation(locations, *req.Lat, *req.Lng)
		if closest != nil && distance <= float64(closest.RadiusM) {
			locID := closest.ID
			att.CheckOutLocationID = &locID
			att.CheckOutLocationName = closest.Name
			att.CheckOutDistanceM = &distance
		} else {
			if closest != nil {
				att.CheckOutDistanceM = &distance
			}
			addr := reverseGeocode(*req.Lat, *req.Lng)
			if att.IsOffsite {
				if addr != "" {
					att.CheckOutLocationName = fmt.Sprintf("ออกหน้างาน (%s)", addr)
				} else {
					att.CheckOutLocationName = "ออกหน้างาน"
				}
			} else {
				if addr != "" {
					att.CheckOutLocationName = fmt.Sprintf("นอกพื้นที่ (%s)", addr)
				} else {
					att.CheckOutLocationName = "นอกพื้นที่"
				}
			}
		}
	}

	if err := s.attendanceRepo.UpdateCheckOut(ctx, att); err != nil {
		return nil, fmt.Errorf("บันทึกเช็คเอาท์ล้มเหลว: %w", err)
	}

	return att, nil
}

func (s *AttendanceService) userWorkSchedule(user *domain.User) (string, string) {
	start := user.WorkStartTime
	if _, err := time.Parse("15:04", start); err != nil {
		start = fmt.Sprintf("%02d:%02d", s.cfg.LateThresholdHour, s.cfg.LateThresholdMinute)
	}
	end := user.WorkEndTime
	if _, err := time.Parse("15:04", end); err != nil {
		end = "18:00"
	}
	return start, end
}

func (s *AttendanceService) isWorkday(ctx context.Context, date time.Time) (bool, error) {
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		return false, nil
	}
	if s.holidayRepo == nil {
		return true, nil
	}
	isHoliday, err := s.holidayRepo.IsHoliday(ctx, date)
	if err != nil {
		return false, err
	}
	return !isHoliday, nil
}

func minutesLate(now time.Time, workStart string) int {
	start, err := time.Parse("15:04", workStart)
	if err != nil {
		return 0
	}
	currentMinute := now.Hour()*60 + now.Minute()
	startMinute := start.Hour()*60 + start.Minute()
	if currentMinute <= startMinute {
		return 0
	}
	return currentMinute - startMinute
}

func closestWorkLocation(locations []domain.WorkLocation, lat, lng float64) (*domain.WorkLocation, float64) {
	var closest *domain.WorkLocation
	closestDistance := 0.0
	for i := range locations {
		distance := geo.HaversineDistance(locations[i].Latitude, locations[i].Longitude, lat, lng)
		if closest == nil || distance < closestDistance {
			closest = &locations[i]
			closestDistance = distance
		}
	}
	return closest, closestDistance
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

// UpdateByAdmin permits a direct correction while preserving an audit trail.
func (s *AttendanceService) UpdateByAdmin(
	ctx context.Context,
	id uuid.UUID,
	changedBy uuid.UUID,
	checkInAt, checkOutAt *time.Time,
	status string,
) (*domain.Attendance, error) {
	before, err := s.attendanceRepo.FindByID(ctx, id)
	if err != nil {
		return nil, errors.New("ไม่พบบันทึกเวลาที่ต้องการแก้ไข")
	}
	after := *before
	if checkInAt != nil && checkOutAt != nil && checkOutAt.Before(*checkInAt) {
		return nil, errors.New("เวลาเช็กเอาต์ต้องอยู่หลังเวลาเช็กอิน")
	}
	after.CheckInAt = checkInAt
	after.CheckOutAt = checkOutAt
	if status == "" {
		after.Status = "on_time"
		if after.IsWorkday && checkInAt != nil && minutesLate(*checkInAt, after.WorkStartTime) > 0 {
			after.Status = "late"
		}
	} else {
		if !validAttendanceStatus(status) {
			return nil, errors.New("สถานะบันทึกเวลาไม่ถูกต้อง")
		}
		after.Status = status
	}
	after.LateMinutes = 0
	if after.Status == "late" && checkInAt != nil {
		after.LateMinutes = minutesLate(*checkInAt, after.WorkStartTime)
	}
	if err := s.attendanceRepo.UpdateByAdmin(ctx, before, &after, changedBy); err != nil {
		return nil, fmt.Errorf("แก้ไขบันทึกเวลาล้มเหลว: %w", err)
	}
	return &after, nil
}

func validAttendanceStatus(status string) bool {
	switch status {
	case "on_time", "late", "no_record", "offsite",
		"sick_leave_full", "sick_leave_morning", "sick_leave_afternoon",
		"personal_leave_full", "personal_leave_morning", "personal_leave_afternoon",
		"annual_leave", "shift_swap", "unknown":
		return true
	default:
		return false
	}
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
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return nil, errors.New("ไม่พบข้อมูลผู้ใช้")
	}
	workStart, workEnd := s.userWorkSchedule(user)
	isWorkday, err := s.isWorkday(ctx, targetDate)
	if err != nil {
		return nil, fmt.Errorf("ตรวจสอบวันหยุดล้มเหลว: %w", err)
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
			// Legacy manual API does not send an exact time. Use this user's
			// schedule instead of the old global 09:00 assumption.
			start, parseErr := time.Parse("15:04", workStart)
			if parseErr != nil {
				start = time.Date(0, 1, 1, 9, 0, 0, 0, time.Local)
			}
			hour, minute := start.Hour(), start.Minute()
			if status == "late" {
				minute += 30
				hour += minute / 60
				minute %= 60
			}
			t = time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, loc)
		}
		checkInTime = &t
	}

	manualLateMinutes := 0
	if status == "late" {
		manualLateMinutes = 30
	}

	att := &domain.Attendance{
		ID:            uuid.New(),
		UserID:        userID,
		Date:          targetDate,
		CheckInAt:     checkInTime,
		Status:        status,
		WorkStartTime: workStart,
		WorkEndTime:   workEnd,
		IsWorkday:     isWorkday,
		IsOffsite:     status == "offsite",
		LateMinutes:   manualLateMinutes,
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

// reverseGeocode แปลงพิกัด GPS Lat, Lng เป็นชื่อย่าน/ตำบล/อำเภอ/จังหวัด
func reverseGeocode(lat, lng float64) string {
	client := &http.Client{
		Timeout: 3 * time.Second,
	}

	// 1. ลองดึงจาก OpenStreetMap (Nominatim) ภาษาไทยก่อน
	nominatimURL := fmt.Sprintf("https://nominatim.openstreetmap.org/reverse?lat=%.6f&lon=%.6f&format=json&accept-language=th", lat, lng)
	req, err := http.NewRequest("GET", nominatimURL, nil)
	if err == nil {
		req.Header.Set("User-Agent", "HRManagementApp/1.0")
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var res struct {
					Address struct {
						Road          string `json:"road"`
						Suburb        string `json:"suburb"`
						Quarter       string `json:"quarter"`
						Neighbourhood string `json:"neighbourhood"`
						CityDistrict  string `json:"city_district"`
						District      string `json:"district"`
						City          string `json:"city"`
						Province      string `json:"province"`
						State         string `json:"state"`
					} `json:"address"`
				}
				if json.NewDecoder(resp.Body).Decode(&res) == nil {
					sub := res.Address.Quarter
					if sub == "" {
						sub = res.Address.Suburb
					}
					if sub == "" {
						sub = res.Address.Neighbourhood
					}
					dist := res.Address.CityDistrict
					if dist == "" {
						dist = res.Address.District
					}
					if dist == "" && res.Address.Suburb != "" && res.Address.Suburb != sub {
						dist = res.Address.Suburb
					}
					prov := res.Address.Province
					if prov == "" {
						prov = res.Address.City
					}
					if prov == "" {
						prov = res.Address.State
					}

					var parts []string
					if res.Address.Road != "" {
						parts = append(parts, res.Address.Road)
					}
					if sub != "" {
						parts = append(parts, sub)
					}
					if dist != "" {
						parts = append(parts, dist)
					}
					if prov != "" && (dist == "" || !strings.Contains(prov, dist)) {
						parts = append(parts, prov)
					}
					if len(parts) > 0 {
						return strings.Join(parts, ", ")
					}
				}
			}
		}
	}

	// 2. สำรอง fallback ไปยัง BigDataCloud API
	bdcURL := fmt.Sprintf("https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=%.6f&longitude=%.6f&localityLanguage=th", lat, lng)
	resp, err := client.Get(bdcURL)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			var bdcRes struct {
				Locality             string `json:"locality"`
				PrincipalSubdivision string `json:"principalSubdivision"`
				LocalityInfo         struct {
					Administrative []struct {
						Name       string `json:"name"`
						AdminLevel int    `json:"adminLevel"`
					} `json:"administrative"`
				} `json:"localityInfo"`
			}
			if json.NewDecoder(resp.Body).Decode(&bdcRes) == nil {
				var district string
				for _, admin := range bdcRes.LocalityInfo.Administrative {
					if admin.AdminLevel == 6 {
						district = admin.Name
						break
					}
				}
				var parts []string
				if bdcRes.Locality != "" {
					parts = append(parts, bdcRes.Locality)
				}
				if district != "" && district != bdcRes.Locality {
					parts = append(parts, district)
				}
				if bdcRes.PrincipalSubdivision != "" {
					parts = append(parts, bdcRes.PrincipalSubdivision)
				}
				if len(parts) > 0 {
					return strings.Join(parts, ", ")
				}
			}
		}
	}

	return ""
}
