package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

type TaskService struct {
	taskRepo    *repository.TaskRepo
	userRepo    *repository.UserRepo
	firebaseSvc *FirebaseService
	notifSvc    *NotificationService
}

func NewTaskService(taskRepo *repository.TaskRepo, userRepo *repository.UserRepo, firebaseSvc *FirebaseService, notifSvc *NotificationService) *TaskService {
	return &TaskService{
		taskRepo:    taskRepo,
		userRepo:    userRepo,
		firebaseSvc: firebaseSvc,
		notifSvc:    notifSvc,
	}
}

func (s *TaskService) ListAllTasks(ctx context.Context) ([]domain.Task, error) {
	return s.taskRepo.ListAll(ctx)
}

func (s *TaskService) ListTasksByUser(ctx context.Context, userID uuid.UUID) ([]domain.Task, error) {
	return s.taskRepo.ListByUser(ctx, userID)
}

func (s *TaskService) CreateTask(ctx context.Context, assigneeIDs []uuid.UUID, title, description string, dueDate time.Time, assignedBy uuid.UUID, brandID *uuid.UUID, categoryID *uuid.UUID) (*domain.Task, error) {
	var primaryAssignee uuid.UUID
	if len(assigneeIDs) > 0 {
		primaryAssignee = assigneeIDs[0]
	}
	t := &domain.Task{
		ID:          uuid.New(),
		AssignedTo:  primaryAssignee,
		Title:       title,
		Description: description,
		DueDate:     dueDate,
		Status:      "pending",
		AssignedBy:  &assignedBy,
		BrandID:     brandID,
		CategoryID:  categoryID,
		AssigneeIDs: assigneeIDs,
	}

	err := s.taskRepo.Create(ctx, t)
	if err != nil {
		return nil, fmt.Errorf("failed to create task: %w", err)
	}

	content := "มอบหมายงานใหม่"
	_ = s.taskRepo.CreateTaskEvent(ctx, &domain.TaskEvent{
		TaskID:    t.ID,
		UserID:    assignedBy,
		EventType: "system",
		Action:    "created",
		Content:   &content,
	})

	// บันทึก notification ลง DB + ส่ง push ผ่าน notifSvc สำหรับทุกคน
	if s.notifSvc != nil {
		for _, uID := range assigneeIDs {
			s.notifSvc.Notify(
				context.Background(),
				uID,
				"มอบหมายงานใหม่",
				"คุณได้รับมอบหมายงานใหม่: "+title,
				"system",
			)
		}
	}

	return t, nil
}

func (s *TaskService) UpdateTaskStatus(ctx context.Context, id uuid.UUID, status string, userID uuid.UUID, isAdmin bool) error {
	task, err := s.taskRepo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}

	// Verify ownership unless the request is made by an Admin
	if !isAdmin && task.AssignedTo != userID {
		return fmt.Errorf("permission denied: task is not assigned to you")
	}

	// Valid status values
	if status != "pending" && status != "in_progress" && status != "completed" {
		return fmt.Errorf("invalid status value")
	}

	err = s.taskRepo.UpdateStatus(ctx, id, status)
	if err != nil {
		return err
	}

	content := "อัปเดตสถานะงานเป็น: " + status
	_ = s.taskRepo.CreateTaskEvent(ctx, &domain.TaskEvent{
		TaskID:    id,
		UserID:    userID,
		EventType: "system",
		Action:    "status_changed",
		Content:   &content,
	})

	// Trigger Push Notification to admins when employee updates status
	if !isAdmin && s.userRepo != nil && s.firebaseSvc != nil {
		employee, userErr := s.userRepo.FindByID(ctx, userID)
		if userErr == nil && employee != nil {
			employeeName := employee.FullName()
			statusThai := "รอทำ"
			if status == "in_progress" {
				statusThai = "กำลังทำ"
			} else if status == "completed" {
				statusThai = "เสร็จสิ้น"
			}

			// Find all admin users to notify
			admins, listErr := s.userRepo.ListAll(ctx)
			if listErr == nil {
				for _, admin := range admins {
					if admin.Role == "admin" && admin.FcmToken != nil && *admin.FcmToken != "" {
						fcmToken := *admin.FcmToken
						taskTitle := task.Title
						go func() {
							_ = s.firebaseSvc.SendNotification(context.Background(), fcmToken, "อัปเดตงานพนักงาน 📋", employeeName + " เปลี่ยนสถานะงาน: " + taskTitle + " เป็น [" + statusThai + "]")
						}()
					}
				}
			}
		}
	}

	return nil
}

func (s *TaskService) DeleteTask(ctx context.Context, id uuid.UUID) error {
	return s.taskRepo.Delete(ctx, id)
}

func (s *TaskService) ListTaskEvents(ctx context.Context, taskID uuid.UUID) ([]domain.TaskEvent, error) {
	return s.taskRepo.ListTaskEvents(ctx, taskID)
}

func (s *TaskService) AddTaskComment(ctx context.Context, taskID, userID uuid.UUID, content string) (*domain.TaskEvent, error) {
	e := &domain.TaskEvent{
		ID:        uuid.New(),
		TaskID:    taskID,
		UserID:    userID,
		EventType: "comment",
		Action:    "commented",
		Content:   &content,
	}
	err := s.taskRepo.CreateTaskEvent(ctx, e)
	return e, err
}

func (s *TaskService) ListAllTaskEvents(ctx context.Context) ([]domain.TaskEvent, error) {
	return s.taskRepo.ListAllTaskEvents(ctx)
}
