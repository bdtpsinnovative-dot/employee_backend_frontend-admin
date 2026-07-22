package domain

import (
	"time"

	"github.com/google/uuid"
)

// User represents an employee or admin in the system.
// Maps to: public.users table
// Old sheet: ฐานข้อมูลพนักงาน
type User struct {
	ID            uuid.UUID `db:"id" json:"id"`
	AuthID        uuid.UUID `db:"auth_id" json:"auth_id"`
	Email         string    `db:"email" json:"email"`
	FirstName     string    `db:"first_name" json:"first_name"`
	LastName      string    `db:"last_name" json:"last_name"`
	Department    string    `db:"department" json:"department"`
	Position      string    `db:"position" json:"position"`
	Role          string    `db:"role" json:"role"`     // "employee" | "admin"
	Status        string    `db:"status" json:"status"` // "pending" | "active" | "disabled"
	DeviceID      *string   `db:"device_id" json:"device_id,omitempty"`
	AvatarURL     *string   `db:"avatar_url" json:"avatar_url,omitempty"`
	FcmToken      *string   `db:"fcm_token" json:"fcm_token,omitempty"`
	FaceEmbedding *string   `db:"face_embedding" json:"-"`
	HasFace       bool      `db:"-" json:"has_face_embedding"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at" json:"updated_at"`
}

func (u User) FullName() string {
	return u.FirstName + " " + u.LastName
}

func (u User) IsAdmin() bool {
	return u.Role == "admin"
}

func (u User) IsActive() bool {
	return u.Status == "active"
}

// WorkLocation represents a geofence center point.
// Maps to: public.work_locations table
type WorkLocation struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	Latitude  float64   `db:"latitude" json:"latitude"`
	Longitude float64   `db:"longitude" json:"longitude"`
	RadiusM   int       `db:"radius_m" json:"radius_m"`
	IsActive  bool      `db:"is_active" json:"is_active"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// Attendance represents a daily check-in/check-out record.
// Maps to: public.attendance table
// Old sheet: บันทึกลงเวลา
type Attendance struct {
	ID            uuid.UUID  `db:"id" json:"id"`
	UserID        uuid.UUID  `db:"user_id" json:"user_id"`
	Date          time.Time  `db:"date" json:"date"` // DATE only
	CheckInAt     *time.Time `db:"check_in_at" json:"check_in_at,omitempty"`
	CheckOutAt    *time.Time `db:"check_out_at" json:"check_out_at,omitempty"`
	Status        string     `db:"status" json:"status"` // "on_time" | "late" | "no_record"
	CheckInLat    *float64   `db:"check_in_lat" json:"check_in_lat,omitempty"`
	CheckInLng    *float64   `db:"check_in_lng" json:"check_in_lng,omitempty"`
	CheckOutLat   *float64   `db:"check_out_lat" json:"check_out_lat,omitempty"`
	CheckOutLng   *float64   `db:"check_out_lng" json:"check_out_lng,omitempty"`
	CheckInPhoto  *string    `db:"check_in_photo" json:"check_in_photo,omitempty"`
	CheckOutPhoto *string    `db:"check_out_photo" json:"check_out_photo,omitempty"`
	LocationID    *uuid.UUID `db:"location_id" json:"location_id,omitempty"`
	CreatedAt     time.Time  `db:"created_at" json:"created_at"`
}

// LeaveRequest represents a leave/absence request.
// Maps to: public.leave_requests table
// Old sheet: ใบลาพนักงาน
type LeaveRequest struct {
	ID             uuid.UUID  `db:"id" json:"id"`
	UserID         uuid.UUID  `db:"user_id" json:"user_id"`
	Date           time.Time  `db:"date" json:"date"`
	LeaveType      string     `db:"leave_type" json:"leave_type"` // ลาป่วย, ลากิจ, สลับวันหยุด, ทำงานวันหยุด
	Duration       string     `db:"duration" json:"duration"`     // เต็มวัน, ครึ่งวันเช้า, ครึ่งวันบ่าย
	SwapDate       *time.Time `db:"swap_date" json:"swap_date,omitempty"`
	Reason         string     `db:"reason" json:"reason"`
	Status         string     `db:"status" json:"status"` // "pending" | "approved" | "rejected"
	MedicalCertURL *string    `db:"medical_cert_url" json:"medical_cert_url,omitempty"`
	ReviewedBy     *uuid.UUID `db:"reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt     *time.Time `db:"reviewed_at" json:"reviewed_at,omitempty"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
}

// OffsiteRequest represents a request to work outside the office.
// Maps to: public.offsite_requests table
// Old sheet: OffsiteRequests
type OffsiteRequest struct {
	ID         uuid.UUID  `db:"id" json:"id"`
	UserID     uuid.UUID  `db:"user_id" json:"user_id"`
	Date       time.Time  `db:"date" json:"date"`
	Reason     string     `db:"reason" json:"reason"`
	Status     string     `db:"status" json:"status"` // "pending" | "approved" | "rejected"
	ReviewedBy *uuid.UUID `db:"reviewed_by" json:"reviewed_by,omitempty"`
	ReviewedAt *time.Time `db:"reviewed_at" json:"reviewed_at,omitempty"`
	CreatedAt  time.Time  `db:"created_at" json:"created_at"`
}

// Holiday represents a public or company holiday.
// Maps to: public.holidays table
// Old sheet: Holidays
type Holiday struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Date      time.Time `db:"date" json:"date"`
	Name      string    `db:"name" json:"name"`
	NumDays   int       `db:"num_days" json:"num_days"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// LeaveQuota represents the annual leave quota for a user.
// Maps to: public.leave_quotas table
type LeaveQuota struct {
	ID            uuid.UUID `db:"id" json:"id"`
	UserID        uuid.UUID `db:"user_id" json:"user_id"`
	Year          int       `db:"year" json:"year"`
	SickLeave     int       `db:"sick_leave" json:"sick_leave"`
	PersonalLeave int       `db:"personal_leave" json:"personal_leave"`
	AnnualLeave   int       `db:"annual_leave" json:"annual_leave"`
	CreatedAt     time.Time `db:"created_at" json:"created_at"`
	UpdatedAt     time.Time `db:"updated_at" json:"updated_at"`
}

// LeaveUsage represents the calculated leave balances.
type LeaveBalance struct {
	LeaveType string  `json:"leave_type"`
	Quota     float64 `json:"quota"`
	Used      float64 `json:"used"`
	Remaining float64 `json:"remaining"`
}

// Task represents a work task assigned to an employee.
type Task struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	AssignedTo  uuid.UUID  `db:"assigned_to" json:"assigned_to"`
	Title       string     `db:"title" json:"title"`
	Description string     `db:"description" json:"description"`
	DueDate     time.Time  `db:"due_date" json:"due_date"`
	Status      string     `db:"status" json:"status"` // "pending" | "in_progress" | "completed"
	AssignedBy  *uuid.UUID `db:"assigned_by" json:"assigned_by,omitempty"`
	BrandID     *uuid.UUID `db:"brand_id" json:"brand_id,omitempty"`
	CategoryID  *uuid.UUID `db:"category_id" json:"category_id,omitempty"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	// Joined fields (not stored in tasks table)
	SubItems    []TaskSubItem `db:"-" json:"sub_items,omitempty"`
	AssigneeIDs []uuid.UUID   `db:"-" json:"assignee_ids,omitempty"`
	CardTotal   int           `db:"card_total" json:"card_total"`
	CardDone    int           `db:"card_done" json:"card_done"`
}

// Notification represents an in-app notification record for an employee.
// Maps to: public.notifications table
type Notification struct {
	ID        uuid.UUID `db:"id"         json:"id"`
	UserID    uuid.UUID `db:"user_id"    json:"user_id"`
	Title     string    `db:"title"      json:"title"`
	Body      string    `db:"body"       json:"body"`
	Type      string    `db:"type"       json:"type"`      // "leave" | "attendance" | "system" | "announcement"
	IsRead    bool      `db:"is_read"    json:"is_read"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// AppSetting represents a key-value setting in the system.
type AppSetting struct {
	Key   string `db:"key" json:"key"`
	Value string `db:"value" json:"value"`
}

// Brand represents a brand/client that tasks can be associated with.
// Maps to: public.brands table
type Brand struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// TaskCategory represents a category/type of task.
// Maps to: public.task_categories table
type TaskCategory struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

// TaskSubItem represents a checklist item within a task.
// Maps to: public.task_sub_items table
type TaskSubItem struct {
	ID                uuid.UUID  `db:"id" json:"id"`
	TaskID            uuid.UUID  `db:"task_id" json:"task_id"`
	CardID            *uuid.UUID `db:"card_id" json:"card_id,omitempty"`
	Title             string     `db:"title" json:"title"`
	IsDone            bool       `db:"is_done" json:"is_done"`
	Status            string     `db:"status" json:"status"` // "pending" | "in_progress" | "completed"
	SortOrder         int        `db:"sort_order" json:"sort_order"`
	CreatedAt         time.Time  `db:"created_at" json:"created_at"`
	StartDate         *time.Time `db:"start_date" json:"start_date,omitempty"`
	DueDate           *time.Time `db:"due_date" json:"due_date,omitempty"`
	LinkURL           *string    `db:"link_url" json:"link_url,omitempty"`
	AttachmentURL     *string    `db:"attachment_url" json:"attachment_url,omitempty"`
	VerificationNotes *string               `db:"verification_notes" json:"verification_notes,omitempty"`
	AdminComment      *string               `db:"admin_comment" json:"admin_comment,omitempty"`
	Verifications     []SubItemVerification `json:"verifications,omitempty"`
}

// SubItemVerification represents a single round of verification/inspection for a checklist sub-item.
type SubItemVerification struct {
	ID           uuid.UUID  `db:"id" json:"id"`
	SubItemID    uuid.UUID  `db:"sub_item_id" json:"sub_item_id"`
	VerifiedBy   *uuid.UUID `db:"verified_by" json:"verified_by,omitempty"`
	VerifierName string     `db:"verifier_name" json:"verifier_name"`
	Round        int        `db:"round" json:"round"`
	Status       string     `db:"status" json:"status"` // "approved" | "rejected"
	Notes        *string    `db:"notes" json:"notes,omitempty"`
	CreatedAt    time.Time  `db:"created_at" json:"created_at"`
}

// TaskList represents a list (column) within a Trello board task.
type TaskList struct {
	ID          uuid.UUID  `db:"id" json:"id"`
	TaskID      uuid.UUID  `db:"task_id" json:"task_id"`
	Name        string     `db:"name" json:"name"`
	Description string     `db:"description" json:"description"`
	SortOrder   int        `db:"sort_order" json:"sort_order"`
	CreatedAt   time.Time  `db:"created_at" json:"created_at"`
	StartDate   *time.Time `db:"start_date" json:"start_date,omitempty"`
	DueDate     *time.Time `db:"due_date" json:"due_date,omitempty"`
	Cards       []TaskCard `db:"-" json:"cards"`
}

// CardAttachment represents a file/image/link attachment on a task card.
// Maps to: public.card_attachments table
type CardAttachment struct {
	ID        uuid.UUID  `db:"id" json:"id"`
	CardID    uuid.UUID  `db:"card_id" json:"card_id"`
	URL       string     `db:"url" json:"url"`
	Name      string     `db:"name" json:"name"`
	Type      string     `db:"type" json:"type"` // "image" | "file" | "link"
	CreatedAt time.Time  `db:"created_at" json:"created_at"`
	CreatedBy *uuid.UUID `db:"created_by" json:"created_by,omitempty"`
}

// TaskCard represents a card inside a TaskList.
type TaskCard struct {
	ID          uuid.UUID        `db:"id" json:"id"`
	ListID      uuid.UUID        `db:"list_id" json:"list_id"`
	Title       string           `db:"title" json:"title"`
	Description string           `db:"description" json:"description"`
	Status      string           `db:"status" json:"status"` // "pending" | "in_progress" | "completed"
	SortOrder   int              `db:"sort_order" json:"sort_order"`
	CreatedAt   time.Time        `db:"created_at" json:"created_at"`
	StartDate   *time.Time       `db:"start_date" json:"start_date,omitempty"`
	DueDate     *time.Time       `db:"due_date" json:"due_date,omitempty"`
	Priority    string           `db:"priority" json:"priority"`
	SubItems    []TaskSubItem    `db:"-" json:"sub_items"`
	Attachments []CardAttachment `db:"-" json:"attachments"`
	AdminComment *string         `db:"admin_comment" json:"admin_comment,omitempty"`
}


