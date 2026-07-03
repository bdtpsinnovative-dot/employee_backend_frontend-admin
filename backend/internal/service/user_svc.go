package service

import (
	"context"
	"errors"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
)

// UserService จัดการ business logic เกี่ยวกับผู้ใช้
type UserService struct {
	userRepo *repository.UserRepo
}

func NewUserService(ur *repository.UserRepo) *UserService {
	return &UserService{userRepo: ur}
}

// Register สร้างบัญชีใหม่จาก Supabase Auth (สถานะ pending รอ Admin อนุมัติ)
func (s *UserService) Register(ctx context.Context, authID uuid.UUID, email, firstName, lastName string, avatarURL, faceVector *string) (*domain.User, error) {
	// ตรวจว่ามี user นี้อยู่แล้วหรือยัง
	existing, _ := s.userRepo.FindByAuthID(ctx, authID)
	if existing != nil {
		return existing, nil // มีอยู่แล้ว คืน user เดิมกลับไป
	}

	user := &domain.User{
		ID:            uuid.New(),
		AuthID:        authID,
		Email:         email,
		FirstName:     firstName,
		LastName:      lastName,
		Role:          "employee",
		Status:        "pending", // ต้องรอ Admin อนุมัติก่อนใช้งานได้
		AvatarURL:     avatarURL,
		FaceEmbedding: faceVector,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	return user, nil
}

// CompleteProfile fills every required profile field in one database update.
func (s *UserService) CompleteProfile(
	ctx context.Context,
	userID uuid.UUID,
	firstName, lastName, avatarURL, faceEmbedding string,
) error {
	if _, err := s.userRepo.FindByID(ctx, userID); err != nil {
		return errors.New("ไม่พบข้อมูลผู้ใช้")
	}
	return s.userRepo.UpdateProfileCompletion(
		ctx,
		userID,
		firstName,
		lastName,
		avatarURL,
		faceEmbedding,
	)
}

// GetByAuthID ดึงข้อมูล user จาก Supabase Auth ID
func (s *UserService) GetByAuthID(ctx context.Context, authID uuid.UUID) (*domain.User, error) {
	return s.userRepo.FindByAuthID(ctx, authID)
}

// GetByID ดึงข้อมูล user จาก primary key
func (s *UserService) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	return s.userRepo.FindByID(ctx, id)
}

// UpdateUserProfileAndRole อัปเดตข้อมูลพนักงานและสิทธิ์ (admin)
// ponytail: wrapper minimal for repo call
func (s *UserService) UpdateUserProfileAndRole(ctx context.Context, id uuid.UUID, firstName, lastName, department, position, role string) error {
	return s.userRepo.UpdateProfileAndRole(ctx, id, firstName, lastName, department, position, role)
}

// BindDevice ผูกเครื่องมือถือกับบัญชี (Device Binding - ADR 0003)
func (s *UserService) BindDevice(ctx context.Context, userID uuid.UUID, deviceID string) error {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return errors.New("ไม่พบข้อมูลผู้ใช้")
	}

	// ถ้าผูกเครื่องไว้แล้ว และ device_id ไม่ตรงกัน → บล็อค
	if user.DeviceID != nil && *user.DeviceID != deviceID {
		return errors.New("บัญชีนี้ถูกผูกกับเครื่องอื่นแล้ว กรุณาติดต่อแอดมินเพื่อปลดล็อค")
	}

	// ผูกเครื่องใหม่ (หรือยืนยันเครื่องเดิม)
	return s.userRepo.UpdateDeviceID(ctx, userID, &deviceID)
}

// UpdateFaceEmbedding stores a newly enrolled face template for an existing user.
func (s *UserService) UpdateFaceEmbedding(ctx context.Context, userID uuid.UUID, faceEmbedding string) error {
	if _, err := s.userRepo.FindByID(ctx, userID); err != nil {
		return errors.New("ไม่พบข้อมูลผู้ใช้")
	}
	return s.userRepo.UpdateFaceEmbedding(ctx, userID, faceEmbedding)
}

// ApproveUser อนุมัติบัญชีพนักงาน (Admin เท่านั้น)
func (s *UserService) ApproveUser(ctx context.Context, id uuid.UUID) error {
	return s.userRepo.UpdateStatus(ctx, id, "active")
}

// DisableUser ปิดบัญชีพนักงาน (Admin เท่านั้น)
func (s *UserService) DisableUser(ctx context.Context, id uuid.UUID) error {
	return s.userRepo.UpdateStatus(ctx, id, "disabled")
}

// UnbindDevice ปลดล็อคเครื่องมือถือ (Admin เท่านั้น - ADR 0003)
func (s *UserService) UnbindDevice(ctx context.Context, id uuid.UUID) error {
	return s.userRepo.UpdateDeviceID(ctx, id, nil)
}

// ListAll ดึงรายชื่อพนักงานทั้งหมด (Admin เท่านั้น)
func (s *UserService) ListAll(ctx context.Context) ([]domain.User, error) {
	return s.userRepo.ListAll(ctx)
}
