package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

// LeaveService จัดการ business logic เกี่ยวกับใบลา
type LeaveService struct {
	leaveRepo      *repository.LeaveRepo
	leaveQuotaRepo *repository.LeaveQuotaRepo
}

func NewLeaveService(lr *repository.LeaveRepo, lqr *repository.LeaveQuotaRepo) *LeaveService {
	return &LeaveService{leaveRepo: lr, leaveQuotaRepo: lqr}
}

// Create สร้างใบลาใหม่
func (s *LeaveService) Create(ctx context.Context, req *domain.LeaveRequest) error {
	req.ID = uuid.New()
	req.Status = "pending"
	return s.leaveRepo.Create(ctx, req)
}

// ListMine ดึงใบลาของ user
func (s *LeaveService) ListMine(ctx context.Context, userID uuid.UUID) ([]domain.LeaveRequest, error) {
	return s.leaveRepo.ListByUser(ctx, userID)
}

// ListPending ดึงใบลาที่รออนุมัติ (Admin)
func (s *LeaveService) ListPending(ctx context.Context) ([]domain.LeaveRequest, error) {
	return s.leaveRepo.ListPending(ctx)
}

// ListAll ดึงใบลาทั้งหมดของทุกคน ทุกสถานะ (สำหรับหน้าประวัติย้อนหลัง)
func (s *LeaveService) ListAll(ctx context.Context) ([]domain.LeaveRequest, error) {
	return s.leaveRepo.ListAll(ctx)
}

// ListByMonthAllUsers ดึงใบลาของทุกคนในเดือน (Admin)
func (s *LeaveService) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.LeaveRequest, error) {
	return s.leaveRepo.ListByMonthAllUsers(ctx, year, month)
}

// UpdateStatus อนุมัติ/ปฏิเสธใบลา (Admin)
func (s *LeaveService) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reviewedBy uuid.UUID) error {
	return s.leaveRepo.UpdateStatus(ctx, id, status, reviewedBy)
}

// GetLeaveBalances ดึงโควต้าวันลาที่เหลือของ user ในปีนั้น
func (s *LeaveService) GetLeaveBalances(ctx context.Context, userID uuid.UUID, year int) ([]domain.LeaveBalance, error) {
	// 1. Fetch quota (fallback to default if not found)
	quota, err := s.leaveQuotaRepo.GetQuota(ctx, userID, year)
	if err != nil {
		return nil, err
	}
	if quota == nil {
		quota = &domain.LeaveQuota{
			SickLeave:     30,
			PersonalLeave: 6,
			AnnualLeave:   6,
		}
	}

	// 2. Fetch usage stats
	stats, err := s.leaveRepo.GetLeaveUsageStats(ctx, userID, year)
	if err != nil {
		return nil, err
	}

	usageMap := make(map[string]float64)
	for _, stat := range stats {
		usageMap[stat.LeaveType] = stat.TotalDays
	}

	// 3. Calculate balances
	balances := []domain.LeaveBalance{
		{
			LeaveType: "ลาป่วย",
			Quota:     float64(quota.SickLeave),
			Used:      usageMap["ลาป่วย"],
			Remaining: float64(quota.SickLeave) - usageMap["ลาป่วย"],
		},
		{
			LeaveType: "ลากิจ",
			Quota:     float64(quota.PersonalLeave),
			Used:      usageMap["ลากิจ"],
			Remaining: float64(quota.PersonalLeave) - usageMap["ลากิจ"],
		},
		{
			LeaveType: "ลาพักร้อน",
			Quota:     float64(quota.AnnualLeave),
			Used:      usageMap["ลาพักร้อน"],
			Remaining: float64(quota.AnnualLeave) - usageMap["ลาพักร้อน"],
		},
	}

	return balances, nil
}

// GetUserQuota ดึงโควต้าปัจจุบันของ user (Admin)
func (s *LeaveService) GetUserQuota(ctx context.Context, userID uuid.UUID, year int) (*domain.LeaveQuota, error) {
	quota, err := s.leaveQuotaRepo.GetQuota(ctx, userID, year)
	if err != nil {
		return nil, err
	}
	if quota == nil {
		return &domain.LeaveQuota{
			UserID:        userID,
			Year:          year,
			SickLeave:     30,
			PersonalLeave: 6,
			AnnualLeave:   6,
		}, nil
	}
	return quota, nil
}

// UpdateUserQuota อัปเดตโควต้าของ user (Admin)
func (s *LeaveService) UpdateUserQuota(ctx context.Context, quota *domain.LeaveQuota) error {
	return s.leaveQuotaRepo.UpsertQuota(ctx, quota)
}

// OffsiteService จัดการ business logic เกี่ยวกับคำขอออกหน้างาน
type OffsiteService struct {
	offsiteRepo *repository.OffsiteRepo
}

func NewOffsiteService(or *repository.OffsiteRepo) *OffsiteService {
	return &OffsiteService{offsiteRepo: or}
}

// Create สร้างคำขอออกหน้างานใหม่
func (s *OffsiteService) Create(ctx context.Context, req *domain.OffsiteRequest) error {
	req.ID = uuid.New()
	req.Status = "pending"
	return s.offsiteRepo.Create(ctx, req)
}

// ListMine ดึงคำขอของ user
func (s *OffsiteService) ListMine(ctx context.Context, userID uuid.UUID) ([]domain.OffsiteRequest, error) {
	return s.offsiteRepo.ListByUser(ctx, userID)
}

// ListPending ดึงคำขอที่รออนุมัติ (Admin)
func (s *OffsiteService) ListPending(ctx context.Context) ([]domain.OffsiteRequest, error) {
	return s.offsiteRepo.ListPending(ctx)
}

// ListAll ดึงคำขอออกหน้างานทั้งหมด ทุกสถานะ (สำหรับหน้าประวัติย้อนหลัง)
func (s *OffsiteService) ListAll(ctx context.Context) ([]domain.OffsiteRequest, error) {
	return s.offsiteRepo.ListAll(ctx)
}

// ListByMonthAllUsers ดึงคำขอออกหน้างานของทุกคนในเดือน (Admin)
func (s *OffsiteService) ListByMonthAllUsers(ctx context.Context, year, month int) ([]domain.OffsiteRequest, error) {
	return s.offsiteRepo.ListByMonthAllUsers(ctx, year, month)
}

// UpdateStatus อนุมัติ/ปฏิเสธคำขอ (Admin)
func (s *OffsiteService) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reviewedBy uuid.UUID) error {
	return s.offsiteRepo.UpdateStatus(ctx, id, status, reviewedBy)
}

// HolidayService จัดการ business logic เกี่ยวกับวันหยุด
type HolidayService struct {
	holidayRepo *repository.HolidayRepo
}

func NewHolidayService(hr *repository.HolidayRepo) *HolidayService {
	return &HolidayService{holidayRepo: hr}
}

// ListByYear ดึงวันหยุดทั้งปี
func (s *HolidayService) ListByYear(ctx context.Context, year int) ([]domain.Holiday, error) {
	return s.holidayRepo.ListByYear(ctx, year)
}

// Create เพิ่มวันหยุดใหม่ (Admin)
func (s *HolidayService) Create(ctx context.Context, h *domain.Holiday) error {
	h.ID = uuid.New()
	return s.holidayRepo.Create(ctx, h)
}

// Delete ลบวันหยุด (Admin)
func (s *HolidayService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.holidayRepo.Delete(ctx, id)
}
