package handler_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/Nattamon123/employee/backend/internal/handler"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func TestTaskHandler_ListMyTasks(t *testing.T) {
	_ = godotenv.Load("../../.env")
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		t.Skip("Skipping handler test: SUPABASE_DATABASE_URL not set")
	}

	db, err := repository.NewDB(dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	taskRepo := repository.NewTaskRepo(db)
	userRepo := repository.NewUserRepo(db)
	taskSvc := service.NewTaskService(taskRepo, userRepo, nil, nil)
	
	// Assuming NewTaskHandler takes (taskSvc, subItemRepo)
	// But since subItemRepo is not heavily used in ListMyTasks, passing nil might panic if not careful.
	// Actually we should see the exact signature of NewTaskHandler
	// For now we try to instantiate it
	h := handler.NewTaskHandler(taskSvc, nil)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest("GET", "/api/tasks", nil)
	c.Request = req

	userID := uuid.New()
	c.Set(middleware.ContextKeyUserID, userID)

	h.ListMyTasks(c)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}

	var response map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if ok, exists := response["ok"].(bool); !exists || !ok {
		t.Errorf("Expected ok=true in response, got %v", response["ok"])
	}
}

func TestTaskHandler_ListAllTasks(t *testing.T) {
	_ = godotenv.Load("../../.env")
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		t.Skip("Skipping handler test: SUPABASE_DATABASE_URL not set")
	}

	db, err := repository.NewDB(dbURL)
	if err != nil {
		t.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	taskRepo := repository.NewTaskRepo(db)
	userRepo := repository.NewUserRepo(db)
	taskSvc := service.NewTaskService(taskRepo, userRepo, nil, nil)
	
	h := handler.NewTaskHandler(taskSvc, nil)

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req := httptest.NewRequest("GET", "/admin/tasks", nil)
	c.Request = req

	userID := uuid.New()
	c.Set(middleware.ContextKeyUserID, userID)
	c.Set(middleware.ContextKeyRole, "admin")

	h.ListAllTasks(c)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d. Body: %s", w.Code, w.Body.String())
	}
}
