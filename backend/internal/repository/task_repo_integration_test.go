package repository

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Nattamon123/employee/backend/internal/perf"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func TestTaskRepoListAllIntegration(t *testing.T) {
	if os.Getenv("RUN_DB_INTEGRATION") != "1" {
		t.Skip("set RUN_DB_INTEGRATION=1 to run against the configured database")
	}
	if err := godotenv.Load("../../.env"); err != nil && os.Getenv("SUPABASE_DATABASE_URL") == "" {
		t.Fatalf("load database configuration: %v", err)
	}

	connectionURL, err := databaseURLWithPublicSearchPath(os.Getenv("SUPABASE_DATABASE_URL"))
	if err != nil {
		t.Fatalf("prepare database URL: %v", err)
	}
	db, err := sqlx.Connect("postgres", connectionURL)
	if err != nil {
		t.Fatalf("connect to database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	startedAt := time.Now()
	ctx := perf.WithTracker(t.Context())
	tasks, err := NewTaskRepo(db).ListAll(ctx)
	if err != nil {
		t.Fatalf("list tasks: %v", err)
	}
	if tasks == nil {
		t.Fatal("expected a non-nil task slice")
	}
	stats := perf.GetStats(ctx)
	t.Logf("loaded %d tasks in %s (database: %s, queries: %d)", len(tasks), time.Since(startedAt), stats.DBTotal, len(stats.Spans))
	for _, span := range stats.Spans {
		t.Logf("%s: %s", span.Name, span.Duration)
	}
	payload, err := json.Marshal(tasks)
	if err != nil {
		t.Fatalf("marshal task response: %v", err)
	}
	t.Logf("all-task response payload: %d bytes", len(payload))

	var busiestUserID uuid.UUID
	if err := db.Get(&busiestUserID, `
		SELECT user_id
		FROM task_assignees
		GROUP BY user_id
		ORDER BY COUNT(*) DESC
		LIMIT 1
	`); err != nil {
		t.Fatalf("select representative user: %v", err)
	}
	userContext := perf.WithTracker(t.Context())
	userStartedAt := time.Now()
	userTasks, err := NewTaskRepo(db).ListByUser(userContext, busiestUserID)
	if err != nil {
		t.Fatalf("list representative user tasks: %v", err)
	}
	userStats := perf.GetStats(userContext)
	t.Logf("loaded %d representative user tasks in %s (database: %s, queries: %d)", len(userTasks), time.Since(userStartedAt), userStats.DBTotal, len(userStats.Spans))
}
