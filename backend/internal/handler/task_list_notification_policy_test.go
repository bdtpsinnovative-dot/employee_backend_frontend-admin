package handler

import "testing"

func TestShouldPushTaskListStatus(t *testing.T) {
	tests := []struct {
		status string
		want   bool
	}{
		{status: "waiting", want: false},
		{status: "pending", want: false},
		{status: "in_progress", want: false},
		{status: "in_review", want: true},
		{status: "completed", want: true},
	}

	for _, test := range tests {
		if got := shouldPushTaskListStatus(test.status); got != test.want {
			t.Fatalf("shouldPushTaskListStatus(%q) = %v, want %v", test.status, got, test.want)
		}
	}
}
