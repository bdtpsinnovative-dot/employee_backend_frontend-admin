package service

import (
	"testing"
	"time"

	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/google/uuid"
)

func TestMinutesLateUsesMinutePrecision(t *testing.T) {
	tests := []struct {
		name string
		now  time.Time
		want int
	}{
		{name: "seconds within start minute are on time", now: time.Date(2026, 8, 20, 8, 0, 59, 0, time.Local), want: 0},
		{name: "next minute is late", now: time.Date(2026, 8, 20, 8, 1, 0, 0, time.Local), want: 1},
		{name: "thirty minutes late", now: time.Date(2026, 8, 20, 8, 30, 42, 0, time.Local), want: 30},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := minutesLate(tt.now, "08:00"); got != tt.want {
				t.Fatalf("minutesLate() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestClosestWorkLocation(t *testing.T) {
	nearID := uuid.New()
	farID := uuid.New()
	locations := []domain.WorkLocation{
		{ID: farID, Name: "สาขาไกล", Latitude: 13.8000, Longitude: 100.6000, RadiusM: 100},
		{ID: nearID, Name: "สำนักงานใหญ่", Latitude: 13.7563, Longitude: 100.5018, RadiusM: 100},
	}

	got, distance := closestWorkLocation(locations, 13.75631, 100.50181)
	if got == nil || got.ID != nearID {
		t.Fatalf("closestWorkLocation() = %#v, want nearest location", got)
	}
	if distance >= 100 {
		t.Fatalf("closest distance = %.2f, want inside 100 metres", distance)
	}
}

func TestClosestWorkLocationWithNoLocations(t *testing.T) {
	got, distance := closestWorkLocation(nil, 13.7563, 100.5018)
	if got != nil || distance != 0 {
		t.Fatalf("closestWorkLocation(nil) = (%#v, %.2f), want (nil, 0)", got, distance)
	}
}
