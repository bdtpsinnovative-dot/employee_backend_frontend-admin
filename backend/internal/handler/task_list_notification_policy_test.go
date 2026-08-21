package handler

import "testing"

func TestShouldPushTaskListStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{status: "waiting", want: true},
		{status: "pending", want: true},
		{status: "in_progress", want: true},
		{status: "in_review", want: true},
		{status: "completed", want: true},
	}

	for _, test := range tests {
		if got := shouldPushTaskListStatus(test.status); got != test.want {
			t.Fatalf("shouldPushTaskListStatus(%q) = %v, want %v", test.status, got, test.want)
		}
	}
}
