//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"

	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("Warning: .env file not found: %v", err)
	}

	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("SUPABASE_DATABASE_URL is not set")
	}

	db, err := sqlx.Connect("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	result, err := db.Exec("UPDATE users SET device_id = NULL")
	if err != nil {
		log.Fatalf("Failed to reset device IDs: %v", err)
	}

	rows, _ := result.RowsAffected()
	fmt.Printf("Successfully reset device bindings! Rows affected: %d\n", rows)
}
