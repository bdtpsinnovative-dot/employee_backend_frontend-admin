package perf

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type trackerKey struct{}

type Span struct {
	Name     string
	Duration time.Duration
}

type Tracker struct {
	mu    sync.Mutex
	spans []Span
}

type Stats struct {
	DBTotal time.Duration
	Spans   []Span
}

func WithTracker(ctx context.Context) context.Context {
	return context.WithValue(ctx, trackerKey{}, &Tracker{})
}

func MeasureDB(ctx context.Context, name string) func() {
	startedAt := time.Now()
	return func() {
		tracker, ok := ctx.Value(trackerKey{}).(*Tracker)
		if !ok || tracker == nil {
			return
		}
		tracker.mu.Lock()
		tracker.spans = append(tracker.spans, Span{
			Name:     name,
			Duration: time.Since(startedAt),
		})
		tracker.mu.Unlock()
	}
}

func snapshot(ctx context.Context) []Span {
	tracker, ok := ctx.Value(trackerKey{}).(*Tracker)
	if !ok || tracker == nil {
		return nil
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	return append([]Span(nil), tracker.spans...)
}

func GetStats(ctx context.Context) Stats {
	spans := snapshot(ctx)
	stats := Stats{Spans: spans}
	for _, span := range spans {
		stats.DBTotal += span.Duration
	}
	return stats
}

func AddServerTiming(header http.Header, ctx context.Context, appDuration time.Duration) {
	spans := snapshot(ctx)
	parts := make([]string, 0, len(spans)+2)
	var dbTotal time.Duration
	for _, span := range spans {
		dbTotal += span.Duration
		parts = append(parts, fmt.Sprintf("%s;dur=%.1f", serverTimingName(span.Name), durationMS(span.Duration)))
	}
	parts = append(parts,
		fmt.Sprintf("db;dur=%.1f", durationMS(dbTotal)),
		fmt.Sprintf("app;dur=%.1f", durationMS(appDuration)),
	)
	header.Set("Server-Timing", strings.Join(parts, ", "))
	header.Set("Timing-Allow-Origin", "*")
}

func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		startedAt := time.Now()
		ctx := WithTracker(c.Request.Context())
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		spans := snapshot(ctx)
		var dbTotal time.Duration
		spanParts := make([]string, 0, len(spans))
		for _, span := range spans {
			dbTotal += span.Duration
			spanParts = append(spanParts, fmt.Sprintf("%s=%.1fms", span.Name, durationMS(span.Duration)))
		}
		sort.Strings(spanParts)
		log.Printf(
			"[PERF] method=%s path=%s status=%d total_ms=%.1f db_ms=%.1f db_queries=%d spans=%s",
			c.Request.Method,
			c.FullPath(),
			c.Writer.Status(),
			durationMS(time.Since(startedAt)),
			durationMS(dbTotal),
			len(spans),
			strings.Join(spanParts, ";"),
		)
	}
}

func durationMS(duration time.Duration) float64 {
	return float64(duration.Microseconds()) / 1000
}

func serverTimingName(name string) string {
	name = strings.ToLower(name)
	return strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			return r
		}
		return '-'
	}, name)
}
