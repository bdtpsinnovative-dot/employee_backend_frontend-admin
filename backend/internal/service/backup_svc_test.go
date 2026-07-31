package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestDatabaseURLForCLIRemovesDriverOnlyQueryParameters(t *testing.T) {
	got, err := databaseURLForCLI("postgresql://user:secret@db.example.com:6543/postgres?pgbouncer=true&binary_parameters=yes&sslmode=require")
	if err != nil {
		t.Fatalf("databaseURLForCLI() error = %v", err)
	}
	want := "postgresql://user:secret@db.example.com:6543/postgres?options=-c%20search_path%3Dpublic&sslmode=require"
	if got != want {
		t.Fatalf("databaseURLForCLI() = %q, want %q", got, want)
	}
}

func TestIsLocalDatabaseTarget(t *testing.T) {
	tests := []struct {
		name string
		url  string
		want bool
	}{
		{name: "localhost", url: "postgresql://postgres:secret@localhost:5432/app", want: true},
		{name: "loopback", url: "postgresql://postgres:secret@127.0.0.1:5432/app", want: true},
		{name: "docker host", url: "postgresql://postgres:secret@host.docker.internal:5432/app", want: true},
		{name: "cloud database", url: "postgresql://postgres:secret@db.example.supabase.co:5432/postgres", want: false},
		{name: "invalid", url: "not-a-database-url", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isLocalDatabaseTarget(test.url); got != test.want {
				t.Fatalf("isLocalDatabaseTarget() = %v, want %v", got, test.want)
			}
		})
	}
}

func TestBrandResponsibilitiesAreOptionalForLegacyBackupSnapshots(t *testing.T) {
	if !isOptionalBackupSnapshotTable("brand_responsibilities") {
		t.Fatal("expected brand responsibilities to be optional for legacy backups")
	}
	if isOptionalBackupSnapshotTable("users") {
		t.Fatal("expected original backup tables to remain required")
	}
}

func TestBackupAvailabilityAllowsReadOnlyRemoteSnapshot(t *testing.T) {
	backupEnabled, restoreEnabled := backupAvailability(
		"development",
		"postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
		true,
	)

	if !backupEnabled {
		t.Fatal("expected an explicitly enabled database snapshot to work against a remote database")
	}
	if restoreEnabled {
		t.Fatal("expected restore to remain disabled for a remote database")
	}
}

func TestBackupAvailabilityAllowsProductionSnapshotButNeverRestore(t *testing.T) {
	backupEnabled, restoreEnabled := backupAvailability(
		"production",
		"postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
		true,
	)

	if !backupEnabled {
		t.Fatal("expected production database snapshot to be enabled")
	}
	if restoreEnabled {
		t.Fatal("expected restore to remain disabled on production")
	}
}

func TestBackupAvailabilityAllowsExplicitProductionRestore(t *testing.T) {
	backupEnabled, restoreEnabled := backupAvailabilityForTarget(
		"production",
		"postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
		true,
		true,
		"production",
	)

	if !backupEnabled || !restoreEnabled {
		t.Fatalf("expected explicit production restore to be enabled, got backup=%v restore=%v", backupEnabled, restoreEnabled)
	}
}

func TestProductionEnvironmentIsCaseInsensitive(t *testing.T) {
	if !isProductionEnvironment(" Production ") {
		t.Fatal("expected production environment detection to ignore case and surrounding spaces")
	}
}

func TestBackupAvailabilityAllowsRestoreOnlyForLocalDatabase(t *testing.T) {
	backupEnabled, restoreEnabled := backupAvailability(
		"development",
		"postgresql://postgres:secret@localhost:5432/app",
		true,
	)

	if !backupEnabled {
		t.Fatal("expected database snapshot to be enabled")
	}
	if !restoreEnabled {
		t.Fatal("expected restore to be enabled for a local database")
	}
}

func TestCardAssigneesAreIncludedInBackupTables(t *testing.T) {
	if !isBackupTable("card_assignees") {
		t.Fatal("expected card_assignees to be included in database snapshots")
	}
}

func TestExpandRelatedTablesIncludesCardAssignees(t *testing.T) {
	tests := []struct {
		name     string
		selected string
	}{
		{name: "restoring users", selected: "users"},
		{name: "restoring task cards", selected: "task_cards"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			related := expandRelatedTables([]string{test.selected})
			if !related["card_assignees"] {
				t.Fatalf("expected card_assignees to be restored with %s", test.selected)
			}
		})
	}
}

func TestStartRestoreTablesRejectsEmptySelection(t *testing.T) {
	svc := &BackupService{restoreEnabled: true}

	_, err := svc.StartRestoreTables(context.Background(), uuid.New(), uuid.New(), nil)
	if !errors.Is(err, ErrRestoreSelectionNeeded) {
		t.Fatalf("StartRestoreTables() error = %v, want %v", err, ErrRestoreSelectionNeeded)
	}
}
