//go:build ignore

package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("SUPABASE_DATABASE_URL is required")
	}
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	fmt.Println("Dropping old constraint...")
	_, err = db.Exec("ALTER TABLE task_lists DROP CONSTRAINT IF EXISTS task_lists_status_check")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Adding new constraint with 'waiting' status...")
	_, err = db.Exec("ALTER TABLE task_lists ADD CONSTRAINT task_lists_status_check CHECK (status IN ('waiting', 'pending', 'in_progress', 'in_review', 'completed'))")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Database constraint updated successfully!")
}
