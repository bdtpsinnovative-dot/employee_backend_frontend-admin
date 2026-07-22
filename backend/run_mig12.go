//go:build ignore

package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load(".env")
	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("SUPABASE_DATABASE_URL is required")
	}

	db, err := sqlx.Connect("postgres", dbURL)
	if err != nil {
		log.Fatal("Error connecting to database:", err)
	}
	defer db.Close()

	sqlBytes, err := os.ReadFile("migrations/014_sub_item_verifications.sql")
	if err != nil {
		log.Fatal("Error reading migration file:", err)
	}

	fmt.Println("Executing 014_sub_item_verifications.sql...")
	_, err = db.Exec(string(sqlBytes))
	if err != nil {
		log.Fatal("Migration failed:", err)
	}

	fmt.Println("Migration 014 applied successfully!")
}
