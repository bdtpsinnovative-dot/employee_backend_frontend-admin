package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	if err := godotenv.Load(".env"); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	dbURL := os.Getenv("SUPABASE_DATABASE_URL")
	if dbURL == "" {
		log.Fatal("SUPABASE_DATABASE_URL is required")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Error connecting to database:", err)
	}
	defer db.Close()

	queries := []string{
		`CREATE EXTENSION IF NOT EXISTS vector;`,
		`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS face_embedding vector(192);`,
		`DO $$
		BEGIN
			IF EXISTS (
				SELECT 1
				FROM pg_attribute a
				JOIN pg_class c ON c.oid = a.attrelid
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE n.nspname = 'public'
					AND c.relname = 'users'
					AND a.attname = 'face_embedding'
					AND format_type(a.atttypid, a.atttypmod) = 'vector(128)'
			) THEN
				ALTER TABLE public.users
					ALTER COLUMN face_embedding TYPE vector(192)
					USING NULL::vector(192);
			END IF;
		END $$;`,
	}

	for _, query := range queries {
		fmt.Println("Executing:", query)
		_, err := db.Exec(query)
		if err != nil {
			log.Println("Error executing query:", err)
		} else {
			fmt.Println("Success")
		}
	}
}
