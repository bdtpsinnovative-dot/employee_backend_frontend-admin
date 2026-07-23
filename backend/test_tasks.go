package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/jmoiron/sqlx"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

func main() {
	godotenv.Load(".env")
	dbUrl := os.Getenv("SUPABASE_DATABASE_URL")
	if dbUrl == "" {
		dbUrl = "postgres://postgres.gontuswthbppbndtgtxl:d4vB19tWQ0cfKeyi@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
	}
	db, err := sqlx.Connect("postgres", dbUrl)
	if err != nil {
		log.Fatal(err)
	}

	repo := repository.NewTaskRepo(db)
	tasks, err := repo.ListAll(context.Background())
	if err != nil {
		log.Fatalf("Error listing tasks: %v", err)
	}
	fmt.Printf("Tasks: %d\n", len(tasks))
}
