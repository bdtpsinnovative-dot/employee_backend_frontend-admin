package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
)

func main() {
	dbURL := "postgresql://postgres.gontuswthbppbndtgtxl:d4vB19tWQ0cfKeyi@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
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
