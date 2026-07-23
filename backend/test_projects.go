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
	db, err := sqlx.Connect("postgres", dbUrl)
	if err != nil {
		log.Fatal(err)
	}

	repo := repository.NewProjectRepo(db)
	projects, err := repo.ListProjects(context.Background(), nil, true)
	if err != nil {
		log.Fatalf("Error listing projects: %v", err)
	}
	fmt.Printf("Projects: %d\n", len(projects))
}
