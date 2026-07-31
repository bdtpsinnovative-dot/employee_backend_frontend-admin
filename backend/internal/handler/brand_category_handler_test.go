package handler

import (
	"testing"

	"github.com/google/uuid"
)

func TestParseUniqueUUIDs(t *testing.T) {
	first := uuid.New()
	second := uuid.New()

	got, err := parseUniqueUUIDs([]string{
		first.String(),
		" " + second.String() + " ",
		first.String(),
	})
	if err != nil {
		t.Fatalf("parseUniqueUUIDs returned an error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 unique ids, got %d", len(got))
	}
	if got[0] != first || got[1] != second {
		t.Fatalf("unexpected id order: %v", got)
	}
}

func TestParseUniqueUUIDsRejectsInvalidID(t *testing.T) {
	if _, err := parseUniqueUUIDs([]string{"not-a-uuid"}); err == nil {
		t.Fatal("expected invalid UUID to return an error")
	}
}
