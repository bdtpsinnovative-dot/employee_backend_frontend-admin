//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load("../.env")
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("SUPABASE_DATABASE_URL is required")
	}

	db, err := sqlx.Connect("postgres", dbURL)
	if err != nil {
		log.Fatal("Error connecting to database:", err)
	}
	defer db.Close()

	sqlBytes, err := os.ReadFile("../migrations/016_task_submissions.sql")
	if err != nil {
		log.Fatal("Error reading migration file:", err)
	}

	fmt.Println("Executing 016_task_submissions.sql...")
    queries := strings.Split(string(sqlBytes), ";")
    for _, query := range queries {
        q := strings.TrimSpace(query)
        if q == "" {
            continue
        }
        _, err = db.Exec(q)
        if err != nil {
            log.Fatalf("Migration failed on query: %s\nError: %v", q, err)
        }
    }

	fmt.Println("Migration 016 applied successfully!")
}
