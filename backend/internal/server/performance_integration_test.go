package server

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/Nattamon123/employee/backend/internal/handler"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/perf"
	"github.com/Nattamon123/employee/backend/internal/repository"
	"github.com/Nattamon123/employee/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func TestPriorityReadEndpointsIntegration(t *testing.T) {
	if os.Getenv("RUN_DB_INTEGRATION") != "1" {
		t.Skip("set RUN_DB_INTEGRATION=1 to run against the configured database")
	}
	if err := godotenv.Load("../../.env"); err != nil && os.Getenv("SUPABASE_DATABASE_URL") == "" {
		t.Fatalf("load database configuration: %v", err)
	}

	db, err := sqlx.Connect("postgres", os.Getenv("SUPABASE_DATABASE_URL"))
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	warmTestPool(t, db, 4)

	var authID uuid.UUID
	if err := db.Get(&authID, `
		SELECT u.auth_id
		FROM users u
		JOIN task_assignees ta ON ta.user_id = u.id
		GROUP BY u.id, u.auth_id
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`); err != nil {
		t.Fatalf("select representative user: %v", err)
	}

	var boardTaskID uuid.UUID
	if configuredTaskID := os.Getenv("PERF_TASK_ID"); configuredTaskID != "" {
		boardTaskID, err = uuid.Parse(configuredTaskID)
		if err != nil {
			t.Fatalf("parse PERF_TASK_ID: %v", err)
		}
	} else if err := db.Get(&boardTaskID, `
		SELECT t.id
		FROM tasks t
		JOIN task_assignees ta ON ta.task_id = t.id
		JOIN users u ON u.id = ta.user_id
		WHERE u.auth_id = $1
		GROUP BY t.id
		ORDER BY (
			SELECT COUNT(*)
			FROM task_cards tc
			JOIN task_lists tl ON tl.id = tc.list_id
			WHERE tl.task_id = t.id
			  AND tl.deleted_at IS NULL
		) DESC
		LIMIT 1
	`, authID); err != nil {
		t.Fatalf("select representative board task: %v", err)
	}

	userRepo := repository.NewUserRepo(db)
	userService := service.NewUserService(userRepo)
	taskRepo := repository.NewTaskRepo(db)
	taskService := service.NewTaskService(taskRepo, userRepo, nil, nil)
	taskHandler := handler.NewTaskHandler(taskService, nil, nil, nil, nil, taskRepo)
	leaveService := service.NewLeaveService(repository.NewLeaveRepo(db), nil)
	offsiteService := service.NewOffsiteService(repository.NewOffsiteRepo(db))
	adminHandler := handler.NewAdminHandler(userService, leaveService, offsiteService, nil, nil, nil, nil)
	userHandler := handler.NewUserHandler(userService)
	brandCategoryHandler := handler.NewBrandCategoryHandler(
		repository.NewBrandRepo(db),
		repository.NewTaskCategoryRepo(db),
		repository.NewTaskSubItemRepo(db),
		repository.NewTaskListRepo(db),
		repository.NewTaskCardRepo(db),
		repository.NewCardAttachmentRepo(db),
		repository.NewCardCommentRepo(db),
		repository.NewCardAssigneeRepo(db),
		nil,
		repository.NewTaskEventRepo(db),
		userRepo,
	)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(perf.Middleware())
	router.Use(func(c *gin.Context) {
		c.Set(middleware.ContextKeyAuthID, authID.String())
		c.Next()
	})
	router.Use(LoadUserMiddleware(userService))
	router.GET("/api/tasks", taskHandler.ListMyTasks)
	router.GET("/admin/requests/pending", adminHandler.GetPendingRequests)
	router.GET("/api/users/me", userHandler.GetMe)
	router.GET("/api/tasks/:id/trello", brandCategoryHandler.GetTaskTrelloBoard)

	for _, path := range []string{"/api/tasks", "/admin/requests/pending", "/api/users/me"} {
		for run := 1; run <= 3; run++ {
			request := httptest.NewRequest(http.MethodGet, path, nil)
			response := httptest.NewRecorder()
			startedAt := time.Now()
			router.ServeHTTP(response, request)
			duration := time.Since(startedAt)

			if response.Code != http.StatusOK {
				t.Fatalf("%s run %d returned %d", path, run, response.Code)
			}
			t.Logf(
				"%s run=%d total=%s bytes=%d server_timing=%s",
				path,
				run,
				duration,
				response.Body.Len(),
				response.Header().Get("Server-Timing"),
			)
		}
	}

	boardPath := "/api/tasks/" + boardTaskID.String() + "/trello"
	var boardDurations []time.Duration
	for run := 1; run <= 3; run++ {
		request := httptest.NewRequest(http.MethodGet, boardPath, nil)
		response := httptest.NewRecorder()
		startedAt := time.Now()
		router.ServeHTTP(response, request)
		duration := time.Since(startedAt)
		boardDurations = append(boardDurations, duration)

		if response.Code != http.StatusOK {
			t.Fatalf("%s run %d returned %d: %s", boardPath, run, response.Code, response.Body.String())
		}
		t.Logf(
			"/api/tasks/:id/trello run=%d total=%s bytes=%d server_timing=%s",
			run,
			duration,
			response.Body.Len(),
			response.Header().Get("Server-Timing"),
		)
	}
	if boardDurations[1] > 800*time.Millisecond && boardDurations[2] > 800*time.Millisecond {
		t.Fatalf(
			"/api/tasks/:id/trello remains slower than 800ms after warm-up: run2=%s run3=%s",
			boardDurations[1],
			boardDurations[2],
		)
	}

	type burstResult struct {
		path       string
		statusCode int
		duration   time.Duration
	}
	burstPaths := []string{"/api/tasks", "/admin/requests/pending", "/api/users/me"}
	startBurst := make(chan struct{})
	results := make(chan burstResult, len(burstPaths))
	var waitGroup sync.WaitGroup
	for _, path := range burstPaths {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-startBurst
			request := httptest.NewRequest(http.MethodGet, path, nil)
			response := httptest.NewRecorder()
			startedAt := time.Now()
			router.ServeHTTP(response, request)
			results <- burstResult{path: path, statusCode: response.Code, duration: time.Since(startedAt)}
		}()
	}
	close(startBurst)
	waitGroup.Wait()
	close(results)
	for result := range results {
		if result.statusCode != http.StatusOK {
			t.Fatalf("concurrent %s returned %d", result.path, result.statusCode)
		}
		t.Logf("concurrent %s total=%s", result.path, result.duration)
	}
}

func warmTestPool(t *testing.T, db *sqlx.DB, size int) {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 8*time.Second)
	defer cancel()

	connections := make(chan *sqlx.Conn, size)
	var waitGroup sync.WaitGroup
	for range size {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			connection, err := db.Connx(ctx)
			if err != nil {
				t.Errorf("warm test connection: %v", err)
				return
			}
			if err := connection.PingContext(ctx); err != nil {
				t.Errorf("ping test connection: %v", err)
				_ = connection.Close()
				return
			}
			connections <- connection
		}()
	}
	waitGroup.Wait()
	close(connections)
	for connection := range connections {
		_ = connection.Close()
	}
}
