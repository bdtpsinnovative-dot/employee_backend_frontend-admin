package repository

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// UserRepo จัดการ SQL queries สำหรับตาราง users
type UserRepo struct {
	db *sqlx.DB
}

func NewUserRepo(db *sqlx.DB) *UserRepo {
	return &UserRepo{db: db}
}

// FindByAuthID ค้นหา user จาก auth_id (UUID จาก Supabase Auth)
// ใช้ตอน JWT middleware ดึงข้อมูล user หลังจาก verify token สำเร็จ
func (r *UserRepo) FindByAuthID(ctx context.Context, authID uuid.UUID) (*domain.User, error) {
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT id, auth_id, email, first_name, last_name, department, position, role, status, device_id, avatar_url, created_at, updated_at FROM users WHERE auth_id = $1`, authID)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByID ค้นหา user จาก primary key
func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT id, auth_id, email, first_name, last_name, department, position, role, status, device_id, avatar_url, created_at, updated_at FROM users WHERE id = $1`, id)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmail ค้นหา user จาก email
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT id, auth_id, email, first_name, last_name, department, position, role, status, device_id, avatar_url, created_at, updated_at FROM users WHERE email = $1`, email)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Create สร้าง user ใหม่ (สถานะ pending รอ Admin อนุมัติ)
func (r *UserRepo) Create(ctx context.Context, user *domain.User) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO users (id, auth_id, email, first_name, last_name, department, position, role, status, device_id, avatar_url, face_embedding)
		VALUES (:id, :auth_id, :email, :first_name, :last_name, :department, :position, :role, :status, :device_id, :avatar_url, :face_embedding)
	`, user)
	return err
}

// UpdateStatus อัปเดตสถานะบัญชี (pending → active, active → disabled)
func (r *UserRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, status, id)
	return err
}

// UpdateProfileAndRole อัปเดตข้อมูลพนักงานและสิทธิ์ (admin เท่านั้นที่ทำได้)
// ponytail: minimum needed to edit user profile
func (r *UserRepo) UpdateProfileAndRole(ctx context.Context, id uuid.UUID, firstName, lastName, department, position, role string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users 
		SET first_name = $1, last_name = $2, department = $3, position = $4, role = $5, updated_at = NOW() 
		WHERE id = $6`,
		firstName, lastName, department, position, role, id)
	return err
}

// UpdateDeviceID ผูก/ปลดเครื่องมือถือ (เซ็ต device_id หรือ NULL)
func (r *UserRepo) UpdateDeviceID(ctx context.Context, id uuid.UUID, deviceID *string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET device_id = $1 WHERE id = $2`, deviceID, id)
	return err
}

// UpdateFaceEmbedding replaces the stored biometric template.
func (r *UserRepo) UpdateFaceEmbedding(ctx context.Context, id uuid.UUID, faceEmbedding string) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE users SET face_embedding = $1::vector, updated_at = NOW() WHERE id = $2`,
		faceEmbedding,
		id,
	)
	return err
}

// UpdateProfileCompletion saves every field required before entering the app.
func (r *UserRepo) UpdateProfileCompletion(
	ctx context.Context,
	id uuid.UUID,
	firstName, lastName, avatarURL, faceEmbedding string,
) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE users
		 SET first_name = $1,
		     last_name = $2,
		     avatar_url = $3,
		     face_embedding = $4::vector,
		     updated_at = NOW()
		 WHERE id = $5`,
		firstName,
		lastName,
		avatarURL,
		faceEmbedding,
		id,
	)
	return err
}

// ListAll ดึงรายชื่อพนักงานทั้งหมด (สำหรับ Admin)
func (r *UserRepo) ListAll(ctx context.Context) ([]domain.User, error) {
	var users []domain.User
	err := r.db.SelectContext(ctx, &users, `SELECT id, auth_id, email, first_name, last_name, department, position, role, status, device_id, avatar_url, created_at, updated_at FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	return users, nil
}
