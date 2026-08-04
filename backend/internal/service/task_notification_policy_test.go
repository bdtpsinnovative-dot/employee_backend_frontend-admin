package service

import "testing"

func TestShouldPushTaskStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{status: "pending", want: false},
		{status: "in_progress", want: false},
		{status: "in_review", want: true},
		{status: "completed", want: true},
	}

	for _, test := range tests {
		if got := shouldPushTaskStatus(test.status); got != test.want {
			t.Fatalf("shouldPushTaskStatus(%q) = %v, want %v", test.status, got, test.want)
		}
	}
}
