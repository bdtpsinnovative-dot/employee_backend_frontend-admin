package service

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/Nattamon123/employee/backend/internal/repository"
)

// AttendanceReminderService จัดการระบบตรวจเวลาและส่งแจ้งเตือนเช็คอินเข้างานล่วงหน้า 5 นาที
type AttendanceReminderService struct {
	userRepo        *repository.UserRepo
	attendanceRepo  *repository.AttendanceRepo
	leaveRepo       *repository.LeaveRepo
	offsiteRepo     *repository.OffsiteRepo
	holidayRepo     *repository.HolidayRepo
	firebaseSvc     *FirebaseService
	notificationSvc *NotificationService

	mu           sync.Mutex
	lastNotified map[string]time.Time // key: userID_date_minDiff
}

func NewAttendanceReminderService(
	userRepo *repository.UserRepo,
	attendanceRepo *repository.AttendanceRepo,
	leaveRepo *repository.LeaveRepo,
	offsiteRepo *repository.OffsiteRepo,
	holidayRepo *repository.HolidayRepo,
	firebaseSvc *FirebaseService,
	notificationSvc *NotificationService,
) *AttendanceReminderService {
	return &AttendanceReminderService{
		userRepo:        userRepo,
		attendanceRepo:  attendanceRepo,
		leaveRepo:       leaveRepo,
		offsiteRepo:     offsiteRepo,
		holidayRepo:     holidayRepo,
		firebaseSvc:     firebaseSvc,
		notificationSvc: notificationSvc,
		lastNotified:    make(map[string]time.Time),
	}
}

// StartBackgroundWorker เริ่ม Background Worker รันอัตโนมัติทุกๆ 1 นาที
func (s *AttendanceReminderService) StartBackgroundWorker(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		log.Println("[CheckIn Reminder] Background worker started (runs every 1 minute)")
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				log.Println("[CheckIn Reminder] Background worker stopped")
				return
			case <-ticker.C:
				count, err := s.CheckAndSendReminders(context.Background())
				if err != nil {
					log.Printf("[CheckIn Reminder Worker] Error: %v", err)
				} else if count > 0 {
					log.Printf("[CheckIn Reminder Worker] Successfully sent %d reminder(s)", count)
				}
				s.cleanupOldDedupKeys()
			}
		}
	}()
}

// CheckAndSendReminders ตรวจสอบเวลาเข้างานของพนักงานทุกคน และส่งแจ้งเตือนหากเข้าสู่ช่วง 5 นาทีก่อนเข้างาน
func (s *AttendanceReminderService) CheckAndSendReminders(ctx context.Context) (int, error) {
	// 1. ตั้งโซนเวลาเป็นเวลาประเทศไทย (Asia/Bangkok)
	bkkLoc, err := time.LoadLocation("Asia/Bangkok")
	if err != nil {
		bkkLoc = time.FixedZone("Asia/Bangkok", 7*60*60)
	}
	now := time.Now().In(bkkLoc)

	// 2. ข้ามวันเสาร์และอาทิตย์
	weekday := now.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return 0, nil
	}

	todayDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, bkkLoc)

	// 3. ตรวจสอบวันหยุดนักขัตฤกษ์ / วันหยุดบริษัท
	if s.holidayRepo != nil {
		isHoliday, err := s.holidayRepo.IsHoliday(ctx, todayDate)
		if err == nil && isHoliday {
			return 0, nil
		}
	}

	// 4. ดึงรายชื่อพนักงานทั้งหมด
	users, err := s.userRepo.ListAll(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to list users: %w", err)
	}

	sentCount := 0

	for _, user := range users {
		// ต้องเป็นพนักงานที่มีสถานะ active
		if user.Status != "active" {
			continue
		}

		// ต้องมี FCM Token ลงทะเบียนไว้ในระบบ
		if user.FcmToken == nil || *user.FcmToken == "" {
			continue
		}

		// อ่านเวลาเข้างานของแต่ละคน (เช่น "09:00" หรือ "08:30")
		startTimeStr := user.WorkStartTime
		if startTimeStr == "" {
			startTimeStr = "09:00"
		}

		var startHour, startMin int
		if _, err := fmt.Sscanf(startTimeStr, "%d:%d", &startHour, &startMin); err != nil {
			continue
		}

		workStartToday := time.Date(now.Year(), now.Month(), now.Day(), startHour, startMin, 0, 0, bkkLoc)

		// คำนวณเวลาก่อนเข้างาน (นาที)
		diffSeconds := int(workStartToday.Sub(now).Seconds())
		diffMinutes := diffSeconds / 60

		// ตรวจสอบช่วงเวลาเตือน: ตั้งแต่ก่อนเข้างาน 5 นาที (diffMinutes = 5) ถึงเวลาเข้างานพอดี (diffMinutes = 0)
		if diffMinutes < 0 || diffMinutes > 5 {
			continue
		}

		// 5. ตรวจสอบว่าเช็คอินไปแล้วหรือยังในวันนี้
		att, err := s.attendanceRepo.FindByUserAndDate(ctx, user.ID, todayDate)
		if err == nil && att != nil && att.CheckInAt != nil {
			// เช็คอินเข้างานแล้ว ไม่ต้องส่งแจ้งเตือน
			continue
		}

		// 6. ตรวจสอบว่าลาหรือไม่ (ลาเต็มวัน หรือลาครึ่งวันเช้า)
		if s.leaveRepo != nil {
			hasLeave, err := s.leaveRepo.HasApprovedMorningOrFullDayLeaveForDate(ctx, user.ID, todayDate)
			if err == nil && hasLeave {
				// มีใบลาที่อนุมัติแล้ว ข้ามการแจ้งเตือน
				continue
			}
		}

		// 7. ป้องกันการส่งแจ้งเตือนซ้ำในนาทีเดียวกัน (Deduplication)
		dedupKey := fmt.Sprintf("%s_%s_%d", user.ID.String(), todayDate.Format("2006-01-02"), diffMinutes)
		s.mu.Lock()
		if _, exists := s.lastNotified[dedupKey]; exists {
			s.mu.Unlock()
			continue
		}
		s.lastNotified[dedupKey] = now
		s.mu.Unlock()

		// 8. ตรวจสอบว่าขอออกหน้างาน (Offsite) หรือไม่
		isOffsite := false
		if s.offsiteRepo != nil {
			approved, err := s.offsiteRepo.HasApprovedForDate(ctx, user.ID, todayDate)
			if err == nil && approved {
				isOffsite = true
			}
		}

		// 9. ประกอบข้อความแจ้งเตือนตามเงื่อนไข
		displayName := user.Nickname
		if displayName == "" {
			displayName = user.FirstName
		}

		var title, body string
		if isOffsite {
			if diffMinutes == 0 {
				title = "🚗 ถึงเวลาเข้างานแล้ว (ออกหน้างาน)"
				if displayName != "" {
					body = fmt.Sprintf("คุณ%s ถึงเวลาเข้างานแล้ว (%s) อย่าลืมกดเช็คอิน ณ จุดหน้างานนะครับ", displayName, startTimeStr)
				} else {
					body = fmt.Sprintf("ถึงเวลาเข้างานแล้ว (%s) อย่าลืมกดเช็คอิน ณ จุดหน้างานนะครับ", startTimeStr)
				}
			} else {
				title = "🚗 แจ้งเตือนเข้างาน (ออกหน้างาน)"
				if displayName != "" {
					body = fmt.Sprintf("คุณ%s อีก %d นาทีจะถึงเวลาเข้างาน (%s) อย่าลืมกดเช็คอิน ณ จุดหน้างานนะครับ", displayName, diffMinutes, startTimeStr)
				} else {
					body = fmt.Sprintf("อีก %d นาทีจะถึงเวลาเข้างาน (%s) อย่าลืมกดเช็คอิน ณ จุดหน้างานนะครับ", diffMinutes, startTimeStr)
				}
			}
		} else {
			if diffMinutes == 0 {
				title = "⚠️ ถึงเวลาเข้างานแล้ว!"
				if displayName != "" {
					body = fmt.Sprintf("คุณ%s ถึงเวลาเข้างานแล้ว (%s) กรุณากดเช็คอินทันทีเพื่อไม่ให้สายครับ", displayName, startTimeStr)
				} else {
					body = fmt.Sprintf("ถึงเวลาเข้างานแล้ว (%s) กรุณากดเช็คอินทันทีเพื่อไม่ให้สายครับ", startTimeStr)
				}
			} else {
				title = "⏰ ใกล้ถึงเวลาเข้างานแล้ว!"
				if displayName != "" {
					body = fmt.Sprintf("คุณ%s เหลืออีก %d นาทีจะถึงเวลาเข้างาน (%s) กรุณากดเช็คอินให้เรียบร้อยครับ", displayName, diffMinutes, startTimeStr)
				} else {
					body = fmt.Sprintf("เหลืออีก %d นาทีจะถึงเวลาเข้างาน (%s) กรุณากดเช็คอินให้เรียบร้อยครับ", diffMinutes, startTimeStr)
				}
			}
		}

		// 10. ส่ง Push Notification ผ่าน Firebase FCM
		dataPayload := map[string]string{
			"type":         "attendance_reminder",
			"title":        title,
			"body":         body,
			"diff_minutes": fmt.Sprintf("%d", diffMinutes),
			"click_action": "FLUTTER_NOTIFICATION_CLICK",
		}

		if s.firebaseSvc != nil {
			if err := s.firebaseSvc.SendNotification(ctx, *user.FcmToken, title, body, dataPayload); err != nil {
				log.Printf("[CheckIn Reminder] Failed to send push to user %s: %v", user.ID, err)
			} else {
				sentCount++
			}
		}

		// 11. บันทึกลงในกระดิ่งแจ้งเตือนภายในแอป (In-App Notification)
		if s.notificationSvc != nil {
			s.notificationSvc.NotifyInApp(ctx, user.ID, title, body, "attendance", dataPayload)
		}
	}

	return sentCount, nil
}

// cleanupOldDedupKeys ล้างประวัติ deduplication เก่าเกิน 24 ชั่วโมง
func (s *AttendanceReminderService) cleanupOldDedupKeys() {
	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour)
	for k, t := range s.lastNotified {
		if t.Before(cutoff) {
			delete(s.lastNotified, k)
		}
	}
}
