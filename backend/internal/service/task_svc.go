package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
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

func (s *TaskService) ListTasksByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Task, error) {
	return s.taskRepo.ListByProject(ctx, projectID)
}

func (s *TaskService) ListTasksByUser(ctx context.Context, userID uuid.UUID) ([]domain.Task, error) {
	return s.taskRepo.ListByUser(ctx, userID)
}

func (s *TaskService) GetTask(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	return s.taskRepo.FindByID(ctx, id)
}

func (s *TaskService) CreateTask(ctx context.Context, assigneeIDs []uuid.UUID, title, description string, dueDate *time.Time, assignedBy uuid.UUID, brandID *uuid.UUID, categoryID *uuid.UUID, projectID *uuid.UUID, groupID *uuid.UUID, listNames []string, priority string, status string) (*domain.Task, error) {
	if err := s.taskRepo.ValidateAssignees(ctx, assigneeIDs, projectID); err != nil {
		return nil, fmt.Errorf("invalid assignees: %w", err)
	}

	var primaryAssignee *uuid.UUID
	if len(assigneeIDs) > 0 {
		primaryAssignee = &assigneeIDs[0]
	}
	if priority == "" {
		priority = "low"
	}
	if status == "" {
		status = "pending"
	}
	t := &domain.Task{
		ID:          uuid.New(),
		AssignedTo:  primaryAssignee,
		Title:       title,
		Description: description,
		DueDate:     dueDate,
		Status:      status,
		Priority:    priority,
		AssignedBy:  &assignedBy,
		BrandID:     brandID,
		CategoryID:  categoryID,
		ProjectID:   projectID,
		GroupID:     groupID,
		AssigneeIDs: assigneeIDs,
	}

	err := s.taskRepo.CreateWithLists(ctx, t, listNames)
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
			if uID == assignedBy {
				continue // ไม่แจ้งเตือนผู้สร้าง หากเพิ่มตัวเองเป็นผู้รับผิดชอบ
			}
			s.notifSvc.Notify(
				context.Background(),
				uID,
				"มอบหมายงานใหม่",
				"คุณได้รับมอบหมายงานใหม่: "+title,
				"system",
				map[string]string{"task_id": t.ID.String()},
			)
		}
	}

	return t, nil
}

func (s *TaskService) UpdateTask(ctx context.Context, id uuid.UUID, assigneeIDs []uuid.UUID, title, description string, dueDate *time.Time, userID uuid.UUID, isAdmin bool, brandID *uuid.UUID, categoryID *uuid.UUID, priority string, status string) (*domain.Task, error) {
	task, err := s.taskRepo.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	// Only an admin or the creator may change assignment metadata.
	// Assignees may update progress through UpdateTaskStatus, but must not
	// be able to remove other assignees or rewrite the assignment itself.
	if !isAdmin {
		isCreator := task.AssignedBy != nil && *task.AssignedBy == userID
		if !isCreator {
			return nil, fmt.Errorf("permission denied: you cannot edit this task")
		}
	}
	if err := s.taskRepo.ValidateAssignees(ctx, assigneeIDs, task.ProjectID); err != nil {
		return nil, fmt.Errorf("invalid assignees: %w", err)
	}

	var primaryAssignee *uuid.UUID
	if len(assigneeIDs) > 0 {
		primaryAssignee = &assigneeIDs[0]
	}

	oldAssigneeIDs := task.AssigneeIDs

	task.Title = title
	task.Description = description
	task.DueDate = dueDate
	task.BrandID = brandID
	task.CategoryID = categoryID
	task.AssigneeIDs = assigneeIDs
	task.AssignedTo = primaryAssignee
	if priority != "" {
		task.Priority = priority
	}
	if status != "" {
		task.Status = status
	}

	err = s.taskRepo.Update(ctx, task)
	if err != nil {
		return nil, fmt.Errorf("failed to update task: %w", err)
	}

	// Task-level audits are now handled specifically in task_handler.go to prevent duplicate/generic logs.

	// Check if assignees changed
	oldMap := make(map[uuid.UUID]bool)
	for _, id := range oldAssigneeIDs {
		oldMap[id] = true
	}
	var newAssignees []uuid.UUID
	for _, id := range assigneeIDs {
		if !oldMap[id] {
			newAssignees = append(newAssignees, id)
		}
	}

	if len(newAssignees) > 0 {
		// Specific assign/unassign audits are now written by task_handler.go to show real names.

		if s.notifSvc != nil {
			for _, assigneeID := range newAssignees {
				if assigneeID == userID {
					continue
				}
				s.notifSvc.Notify(
					context.Background(),
					assigneeID,
					"มอบหมายงานใหม่",
					"คุณได้รับมอบหมายงานใหม่: "+task.Title,
					"system",
					map[string]string{"task_id": task.ID.String()},
				)
			}
		}
	}

	// Trigger in-app notifications for task updates (excluding the editor)
	if s.notifSvc != nil {
		actorName := "ใครบางคน"
		if actor, err := s.userRepo.FindByID(ctx, userID); err == nil && actor != nil {
			if actor.Nickname != "" {
				actorName = actor.Nickname
			} else {
				actorName = actor.FirstName
			}
		}

		recipients := make(map[uuid.UUID]bool)
		if task.AssignedBy != nil {
			recipients[*task.AssignedBy] = true
		}
		for _, aid := range task.AssigneeIDs {
			recipients[aid] = true
		}
		delete(recipients, userID)

		for recipientID := range recipients {
			s.notifSvc.Notify(
				ctx,
				recipientID,
				"อัปเดตงานหลัก",
				actorName+" ได้แก้ไขรายละเอียดงานหลัก: "+task.Title,
				"system",
				map[string]string{"task_id": task.ID.String()},
			)
		}
	}

	return task, nil
}

func (s *TaskService) UpdateTaskStatus(ctx context.Context, id uuid.UUID, status string, userID uuid.UUID, isAdmin bool) error {
	log.Printf("[UpdateTaskStatus Debug] Start id=%s, status=%s, userID=%s, isAdmin=%v", id, status, userID, isAdmin)
	task, err := s.taskRepo.FindByID(ctx, id)
	if err != nil {
		log.Printf("[UpdateTaskStatus Debug] FindByID failed: %v", err)
		return fmt.Errorf("task not found: %w", err)
	}

	// Verify ownership unless the request is made by an Admin
	if !isAdmin {
		log.Printf("[UpdateTaskStatus Debug] Checking ownership for employee %s", userID)
		isAssigned := false
		if task.AssignedTo != nil && *task.AssignedTo == userID {
			isAssigned = true
		}
		for _, aid := range task.AssigneeIDs {
			if aid == userID {
				isAssigned = true
				break
			}
		}
		if !isAssigned {
			log.Printf("[UpdateTaskStatus Debug] Ownership check failed")
			return fmt.Errorf("permission denied: task is not assigned to you")
		}
	}

	// Valid status values
	if status != "pending" && status != "in_progress" && status != "completed" && status != "in_review" {
		log.Printf("[UpdateTaskStatus Debug] Invalid status: %s", status)
		return fmt.Errorf("invalid status value")
	}

	err = s.taskRepo.UpdateStatus(ctx, id, status)
	if err != nil {
		log.Printf("[UpdateTaskStatus Debug] UpdateStatus failed: %v", err)
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
			} else if status == "in_review" {
				statusThai = "รอตรวจ"
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
							_ = s.firebaseSvc.SendNotification(context.Background(), fcmToken, "อัปเดตงานพนักงาน 📋", employeeName+" เปลี่ยนสถานะงาน: "+taskTitle+" เป็น ["+statusThai+"]", nil)
						}()
					}
				}
			}
		}
	}

	// Trigger in-app notifications for status change (excluding the editor)
	if s.notifSvc != nil {
		actorName := "ใครบางคน"
		if employee, userErr := s.userRepo.FindByID(ctx, userID); userErr == nil && employee != nil {
			if employee.Nickname != "" {
				actorName = employee.Nickname
			} else {
				actorName = employee.FirstName
			}
		}

		statusThai := "รอทำ"
		if status == "in_progress" {
			statusThai = "กำลังทำ"
		} else if status == "in_review" {
			statusThai = "รอตรวจ"
		} else if status == "completed" {
			statusThai = "เสร็จสิ้น"
		}

		recipients := make(map[uuid.UUID]bool)
		if task.AssignedBy != nil {
			recipients[*task.AssignedBy] = true
		}
		for _, aid := range task.AssigneeIDs {
			recipients[aid] = true
		}
		delete(recipients, userID)

		for recipientID := range recipients {
			s.notifSvc.Notify(
				ctx,
				recipientID,
				"อัปเดตสถานะงานหลัก",
				actorName+" ได้เปลี่ยนสถานะงานหลัก \""+task.Title+"\" เป็น ["+statusThai+"]",
				"system",
				map[string]string{"task_id": task.ID.String()},
			)
		}
	}

	return nil
}

func (s *TaskService) DeleteTask(ctx context.Context, id uuid.UUID) error {
	return s.taskRepo.Delete(ctx, id)
}

func (s *TaskService) ListTrashTasks(ctx context.Context, userID uuid.UUID, isAdmin bool) ([]domain.Task, error) {
	return s.taskRepo.ListTrash(ctx, userID, isAdmin)
}

func (s *TaskService) RestoreTask(ctx context.Context, id uuid.UUID) error {
	return s.taskRepo.Restore(ctx, id)
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
	if err != nil {
		return nil, err
	}

	// Fetch task and user details for notification
	task, err := s.taskRepo.FindByID(ctx, taskID)
	var commenterName string = "ผู้ใช้"
	if s.userRepo != nil {
		if u, _ := s.userRepo.FindByID(ctx, userID); u != nil {
			commenterName = u.FirstName + " " + u.LastName
		}
	}

	if err == nil && task != nil && s.notifSvc != nil {
		// Collect unique recipients
		recipients := make(map[uuid.UUID]bool)
		if task.AssignedBy != nil {
			recipients[*task.AssignedBy] = true
		}
		for _, aID := range task.AssigneeIDs {
			recipients[aID] = true
		}
		// Exclude commenter
		delete(recipients, userID)

		msg := fmt.Sprintf("%s แสดงความคิดเห็นในงาน: %s", commenterName, task.Title)
		for rID := range recipients {
			s.notifSvc.Notify(
				context.Background(),
				rID,
				"ความคิดเห็นใหม่",
				msg,
				"task_comment",
				map[string]string{"task_id": task.ID.String()},
			)
		}
	}

	return e, nil
}

func (s *TaskService) ListAllTaskEvents(ctx context.Context) ([]domain.TaskEvent, error) {
	return s.taskRepo.ListAllTaskEvents(ctx)
}

func (s *TaskService) SubmitTaskWork(ctx context.Context, taskID, userID uuid.UUID, url string) (*domain.TaskSubmission, error) {
	task, err := s.taskRepo.FindByID(ctx, taskID)
	if err != nil {
		return nil, fmt.Errorf("task not found: %w", err)
	}

	isAssigned := false
	if task.AssignedTo != nil && *task.AssignedTo == userID {
		isAssigned = true
	}
	for _, aid := range task.AssigneeIDs {
		if aid == userID {
			isAssigned = true
			break
		}
	}
	if !isAssigned {
		return nil, fmt.Errorf("permission denied: task is not assigned to you")
	}

	sub := &domain.TaskSubmission{
		TaskID:      taskID,
		SubmittedBy: userID,
		URL:         url,
		Version:     task.SubmissionCount + 1,
		Status:      "submitted",
	}

	if err := s.taskRepo.CreateTaskSubmission(ctx, sub); err != nil {
		return nil, fmt.Errorf("failed to create submission: %w", err)
	}

	if err := s.taskRepo.UpdateStatus(ctx, taskID, "in_review"); err != nil {
		return nil, fmt.Errorf("failed to update task status: %w", err)
	}

	content := "ส่งงานเพื่อรอการตรวจ"
	_ = s.taskRepo.CreateTaskEvent(ctx, &domain.TaskEvent{
		TaskID:    taskID,
		UserID:    userID,
		EventType: "system",
		Action:    "submitted",
		Content:   &content,
	})

	return sub, nil
}

func (s *TaskService) GetTaskSubmissions(ctx context.Context, taskID uuid.UUID) ([]domain.TaskSubmission, error) {
	return s.taskRepo.GetTaskSubmissions(ctx, taskID)
}

func (s *TaskService) ApproveSubmission(ctx context.Context, submissionID, taskID, adminID uuid.UUID) error {
	if err := s.taskRepo.UpdateSubmissionStatus(ctx, submissionID, "approved", adminID, nil); err != nil {
		return err
	}
	if err := s.taskRepo.UpdateStatus(ctx, taskID, "completed"); err != nil {
		return err
	}
	content := "อนุมัติผลงาน"
	_ = s.taskRepo.CreateTaskEvent(ctx, &domain.TaskEvent{
		TaskID:    taskID,
		UserID:    adminID,
		EventType: "system",
		Action:    "approved",
		Content:   &content,
	})
	return nil
}

func (s *TaskService) RequestRevision(ctx context.Context, submissionID, taskID, adminID uuid.UUID, note string) error {
	if err := s.taskRepo.UpdateSubmissionStatus(ctx, submissionID, "revision_requested", adminID, &note); err != nil {
		return err
	}
	if err := s.taskRepo.UpdateStatus(ctx, taskID, "in_progress"); err != nil {
		return err
	}
	if err := s.taskRepo.UpdateNeedsRevision(ctx, taskID, true); err != nil {
		return err
	}
	content := "ขอให้แก้ไขงาน: " + note
	_ = s.taskRepo.CreateTaskEvent(ctx, &domain.TaskEvent{
		TaskID:    taskID,
		UserID:    adminID,
		EventType: "system",
		Action:    "revision_requested",
		Content:   &content,
	})
	return nil
}

func (s *TaskService) ToggleStar(ctx context.Context, id uuid.UUID, isStarred bool) error {
	return s.taskRepo.UpdateStarStatus(ctx, id, isStarred)
}
