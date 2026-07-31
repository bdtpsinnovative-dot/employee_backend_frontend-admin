package repository

import "testing"

func TestDatabaseURLWithPublicSearchPath(t *testing.T) {
	got, err := databaseURLWithPublicSearchPath("postgresql://user:secret@db.example.com:5432/app?sslmode=require")
	if err != nil {
		t.Fatalf("databaseURLWithPublicSearchPath() error = %v", err)
	}
	if got != "postgresql://user:secret@db.example.com:5432/app?options=-c%20search_path%3Dpublic&sslmode=require" {
		t.Fatalf("databaseURLWithPublicSearchPath() = %q", got)
	}
}
