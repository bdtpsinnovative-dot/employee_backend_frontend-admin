package repository

import (
	"context"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/perf"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

// UserRepo จัดการ SQL queries สำหรับตาราง users
type UserRepo struct {
	db *sqlx.DB
}

const userSelectColumns = `
	u.id, u.auth_id, u.email, u.first_name, u.last_name, u.nickname,
	u.department, u.team_id, u.position_id,
	COALESCE(p.name, '') AS position,
	COALESCE(t.name, '') AS team,
	u.role, u.status,
	to_char(u.work_start_time, 'HH24:MI') AS work_start_time,
	to_char(u.work_end_time, 'HH24:MI') AS work_end_time,
	u.device_id, u.avatar_url, u.fcm_token,
	u.face_embedding::text AS face_embedding,
	u.created_at, u.updated_at`

const userSelectJoins = `
	FROM users u
	LEFT JOIN teams t ON t.id = u.team_id
	LEFT JOIN positions p ON p.id = u.position_id`

func NewUserRepo(db *sqlx.DB) *UserRepo {
	return &UserRepo{db: db}
}

// FindByAuthID ค้นหา user จาก auth_id (UUID จาก Supabase Auth)
// ใช้ตอน JWT middleware ดึงข้อมูล user หลังจาก verify token สำเร็จ
func (r *UserRepo) FindByAuthID(ctx context.Context, authID uuid.UUID) (*domain.User, error) {
	defer perf.MeasureDB(ctx, "db.user.by_auth_id")()
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT `+userSelectColumns+userSelectJoins+` WHERE u.auth_id = $1`, authID)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByID ค้นหา user จาก primary key
func (r *UserRepo) FindByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT `+userSelectColumns+userSelectJoins+` WHERE u.id = $1`, id)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// FindByEmail ค้นหา user จาก email
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	var user domain.User
	err := r.db.GetContext(ctx, &user, `SELECT `+userSelectColumns+userSelectJoins+` WHERE u.email = $1`, email)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// Create สร้าง user ใหม่ (สถานะ pending รอ Admin อนุมัติ)
func (r *UserRepo) Create(ctx context.Context, user *domain.User) error {
	_, err := r.db.NamedExecContext(ctx, `
		INSERT INTO users (id, auth_id, email, first_name, last_name, nickname, department, team_id, position_id, role, status, device_id, avatar_url, face_embedding)
		VALUES (:id, :auth_id, :email, :first_name, :last_name, :nickname, :department, :team_id, :position_id, :role, :status, :device_id, :avatar_url, :face_embedding)
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
func (r *UserRepo) UpdateProfileAndRole(ctx context.Context, id uuid.UUID, firstName, lastName, nickname, department string, teamID, positionID *uuid.UUID, legacyTeam, role string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users 
		SET first_name = $1, last_name = $2, nickname = $3, department = $4,
		    position_id = $5::uuid,
		    team_id = CASE WHEN $5::uuid IS NOT NULL THEN (
		      SELECT p.team_id FROM positions p WHERE p.id = $5::uuid
		    ) ELSE COALESCE($6::uuid, (
		      SELECT t.id FROM teams t
		      WHERE lower(btrim(t.name)) = lower(btrim($7))
		         OR lower(btrim(t.short_name)) = lower(btrim($7))
		      ORDER BY t.sort_order, t.name
		      LIMIT 1
		    )) END,
		    role = $8, updated_at = NOW()
		WHERE id = $9`,
		firstName, lastName, nickname, department, positionID, teamID, legacyTeam, role, id)
	return err
}

// UpdateWorkSchedule changes the employee's regular Monday-Friday schedule.
// Existing attendance rows keep their own schedule snapshot.
func (r *UserRepo) UpdateWorkSchedule(ctx context.Context, id uuid.UUID, startTime, endTime string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET work_start_time = $1::time,
		    work_end_time = $2::time,
		    updated_at = NOW()
		WHERE id = $3
	`, startTime, endTime, id)
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
	firstName, lastName, nickname, avatarURL, faceEmbedding string,
) error {
	_, err := r.db.ExecContext(
		ctx,
		`UPDATE users
		 SET first_name = $1,
		     last_name = $2,
		     nickname = $3,
		     avatar_url = $4,
		     face_embedding = $5::vector,
		     updated_at = NOW()
		 WHERE id = $6`,
		firstName,
		lastName,
		nickname,
		avatarURL,
		faceEmbedding,
		id,
	)
	return err
}

// UpdateProfileInfo updates a user's editable profile fields. Email is
// optional because Supabase Auth may require a separate confirmation step.
func (r *UserRepo) UpdateProfileInfo(ctx context.Context, id uuid.UUID, firstName, lastName, nickname, avatarURL, email string) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE users
		SET first_name = $1,
		    last_name = $2,
		    nickname = $3,
		    avatar_url = $4,
		    email = CASE WHEN NULLIF($5, '') IS NULL THEN email ELSE $5 END,
		    updated_at = NOW()
		WHERE id = $6`,
		firstName, lastName, nickname, avatarURL, email, id)
	return err
}

// ListAll ดึงรายชื่อพนักงานทั้งหมด (สำหรับ Admin)
func (r *UserRepo) ListAll(ctx context.Context) ([]domain.User, error) {
	var users []domain.User
	err := r.db.SelectContext(ctx, &users, `SELECT `+userSelectColumns+userSelectJoins+` ORDER BY u.created_at DESC`)
	if err != nil {
		return nil, err
	}
	return users, nil
}

// ListActiveByTeamID returns the minimal profile projection for active users
// assigned to the given team.
func (r *UserRepo) ListActiveByTeamID(ctx context.Context, teamID uuid.UUID) ([]domain.TeamMember, error) {
	var members []domain.TeamMember
	err := r.db.SelectContext(ctx, &members, `
		SELECT u.id, u.first_name, u.last_name, u.nickname, u.avatar_url,
		       COALESCE(t.name, '') AS team,
		       COALESCE(p.name, '') AS position
		FROM users u
		LEFT JOIN teams t ON t.id = u.team_id
		LEFT JOIN positions p ON p.id = u.position_id
		WHERE u.status = 'active' AND u.team_id = $1
		ORDER BY u.first_name ASC, u.last_name ASC, u.id ASC
	`, teamID)
	if err != nil {
		return nil, err
	}
	return members, nil
}

// CompareFaceDistance คำนวณระยะห่าง (Euclidean distance) ของ Face Vector เทียบกับที่บันทึกไว้
func (r *UserRepo) CompareFaceDistance(ctx context.Context, id uuid.UUID, faceVector string) (float64, error) {
	var distance float64
	err := r.db.GetContext(
		ctx,
		&distance,
		`SELECT (face_embedding <-> $1::vector) AS distance FROM users WHERE id = $2 AND face_embedding IS NOT NULL`,
		faceVector,
		id,
	)
	return distance, err
}

// UpdateFcmToken saves the user's FCM token
func (r *UserRepo) UpdateFcmToken(ctx context.Context, id uuid.UUID, fcmToken string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET fcm_token = $1, updated_at = NOW() WHERE id = $2`, fcmToken, id)
	return err
}
