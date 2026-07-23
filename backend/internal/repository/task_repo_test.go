package repository_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func setupTestDB(t *testing.T) (*repository.TaskRepo, func()) {
	_ = godotenv.Load("../../.env")
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		t.Skip("Skipping integration test: SUPABASE_DATABASE_URL not set")
	}

	db, err := repository.NewDB(dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}

	repo := repository.NewTaskRepo(db)

	cleanup := func() {
		db.Close()
	}
	return repo, cleanup
}

func TestTaskRepo_ListByUser_Integration(t *testing.T) {
	repo, cleanup := setupTestDB(t)
	defer cleanup()

	ctx := context.Background()
	userID := uuid.New()

	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	db, _ := repository.NewDB(dbURL)
	defer db.Close()

	email1 := userID.String() + "@test.com"
	_, err := db.Exec("INSERT INTO users (id, auth_id, first_name, last_name, email, role) VALUES ($1, $1, 'Test', 'User', $2, 'employee') ON CONFLICT DO NOTHING", userID, email1)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	taskID := uuid.New()
	taskID2 := uuid.New()

	_, err = db.Exec(`
		INSERT INTO tasks (id, assigned_to, title, description, status) 
		VALUES ($1, $2, 'Test Task 1', 'Desc 1', 'pending')
	`, taskID, userID)
	if err != nil {
		t.Fatalf("Failed to create task 1: %v", err)
	}

	dueDate := time.Now().AddDate(0, 0, 1)
	userID2 := uuid.New()
	email2 := userID2.String() + "@test.com"
	_, _ = db.Exec("INSERT INTO users (id, auth_id, first_name, last_name, email, role) VALUES ($1, $1, 'Test2', 'User2', $2, 'employee') ON CONFLICT DO NOTHING", userID2, email2)
	
	_, err = db.Exec(`
		INSERT INTO tasks (id, assigned_to, title, description, status, due_date) 
		VALUES ($1, $2, 'Test Task 2', 'Desc 2', 'pending', $3)
	`, taskID2, userID2, dueDate)
	if err != nil {
		t.Fatalf("Failed to create task 2: %v", err)
	}

	_, err = db.Exec(`INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)`, taskID2, userID)
	if err != nil {
		t.Fatalf("Failed to create task assignee: %v", err)
	}

	_, err = db.Exec(`INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)`, taskID, userID)
	if err != nil {
		t.Fatalf("Failed to create task assignee 2: %v", err)
	}

	tasks, err := repo.ListByUser(ctx, userID)
	if err != nil {
		t.Fatalf("ListByUser returned error: %v", err)
	}

	if len(tasks) != 2 {
		t.Errorf("Expected 2 tasks, got %d", len(tasks))
	}

	if len(tasks) == 2 {
		if tasks[0].ID != taskID2 {
			t.Errorf("Expected first task to be Task 2 (with due date), got %v", tasks[0].Title)
		}
		if tasks[1].ID != taskID {
			t.Errorf("Expected second task to be Task 1 (no due date), got %v", tasks[1].Title)
		}
	}

	db.Exec("DELETE FROM tasks WHERE id IN ($1, $2)", taskID, taskID2)
	db.Exec("DELETE FROM users WHERE id IN ($1, $2)", userID, userID2)
}
