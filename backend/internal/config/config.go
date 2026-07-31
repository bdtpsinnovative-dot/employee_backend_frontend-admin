package config

import (
	"fmt"
	"os"
)

// Config holds all configuration for the application.
type Config struct {
	// Server
	Port string

	// Backup environment guard
	AppEnv               string
	BackupRestoreEnabled bool
	BackupRestoreTarget  string

	// Supabase
	SupabaseURL         string
	SupabaseAnonKey     string
	SupabaseDatabaseURL string
	SupabaseJWTSecret   string

	// Geofencing
	DefaultGeofenceRadiusM int
	LateThresholdHour      int // Hour after which check-in is considered "late" (e.g., 9)
	LateThresholdMinute    int
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	cfg := &Config{
		Port:                   getEnv("PORT", ""),
		AppEnv:                 getEnv("APP_ENV", "development"),
		BackupRestoreEnabled:   getEnv("BACKUP_RESTORE_ENABLED", "false") == "true",
		BackupRestoreTarget:    getEnv("BACKUP_RESTORE_TARGET", ""),
		SupabaseURL:            getEnv("SUPABASE_URL", ""),
		SupabaseAnonKey:        getEnv("SUPABASE_ANON_KEY", ""),
		SupabaseDatabaseURL:    getEnv("SUPABASE_DATABASE_URL", ""),
		SupabaseJWTSecret:      getEnv("SUPABASE_JWT_SECRET", ""),
		DefaultGeofenceRadiusM: 50,
		LateThresholdHour:      9,
		LateThresholdMinute:    0,
	}
	if cfg.Port == "" {
		return nil, fmt.Errorf("PORT is required")
	}
	if cfg.SupabaseDatabaseURL == "" {
		cfg.SupabaseDatabaseURL = getEnv("DATABASE_URL", "")
	}
	// Validate required fields
	if cfg.SupabaseDatabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_DATABASE_URL is required")
	}
	if cfg.SupabaseJWTSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWT_SECRET is required")
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
