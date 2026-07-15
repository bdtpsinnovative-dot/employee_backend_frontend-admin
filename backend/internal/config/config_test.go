package config

import (
	"os"
	"testing"
)

func TestLoadUsesDatabaseURLFallback(t *testing.T) {
	original := os.Getenv("SUPABASE_DATABASE_URL")
	defer os.Setenv("SUPABASE_DATABASE_URL", original)

	os.Unsetenv("SUPABASE_DATABASE_URL")
	os.Setenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app")
	os.Setenv("SUPABASE_JWT_SECRET", "secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.SupabaseDatabaseURL != "postgresql://user:pass@localhost:5432/app" {
		t.Fatalf("expected fallback DATABASE_URL to be used, got %q", cfg.SupabaseDatabaseURL)
	}
}
