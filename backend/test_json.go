//go:build ignore

package main

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

func main() {
	db, err := sqlx.Connect("postgres", "postgresql://postgres.gontuswthbppbndtgtxl:d4vB19tWQ0cfKeyi@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres")
	if err != nil {
		panic(err)
	}

	repo := repository.NewTaskRepo(db)
	tasks, err := repo.ListAll(context.Background())
	if err != nil {
		panic(err)
	}

	if len(tasks) > 2 {
		tasks = tasks[:2]
	}
	b, _ := json.MarshalIndent(tasks, "", "  ")
	fmt.Println(string(b))
}
