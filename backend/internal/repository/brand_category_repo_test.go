package repository

import (
	"encoding/json"
	"testing"
)

func TestJSONBParameterUsesTextFormat(t *testing.T) {
	payload := json.RawMessage(`[{"name":"brief.pdf","type":"file"}]`)

	value := jsonbTextValue(&payload)
	if _, ok := value.(string); !ok {
		t.Fatalf("expected JSONB parameter to be a string, got %T", value)
	}
	if value != string(payload) {
		t.Fatalf("expected JSONB parameter %q, got %v", payload, value)
	}

	if got := jsonbTextValue(nil); got != nil {
		t.Fatalf("expected nil JSONB update parameter, got %v", got)
	}
}
