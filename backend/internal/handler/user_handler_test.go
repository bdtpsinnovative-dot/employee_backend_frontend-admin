package handler

import (
	"math"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestFormatFaceVector(t *testing.T) {
	values := make([]float64, faceEmbeddingSize)
	for index := range values {
		values[index] = float64(index) / faceEmbeddingSize
	}

	formatted, err := formatFaceVector(values, true)
	if err != nil {
		t.Fatalf("formatFaceVector returned an error: %v", err)
	}
	if formatted == nil || !strings.HasPrefix(*formatted, "[") || !strings.HasSuffix(*formatted, "]") {
		t.Fatalf("formatFaceVector returned an invalid pgvector value: %v", formatted)
	}
}

func TestFormatFaceVectorRejectsWrongLength(t *testing.T) {
	if _, err := formatFaceVector([]float64{1}, true); err == nil {
		t.Fatal("expected wrong vector length to be rejected")
	}
}

func TestFormatFaceVectorRejectsNonFiniteValue(t *testing.T) {
	values := make([]float64, faceEmbeddingSize)
	values[0] = math.NaN()
	if _, err := formatFaceVector(values, true); err == nil {
		t.Fatal("expected NaN to be rejected")
	}
}

func TestFormatFaceVectorAllowsMissingOptionalVector(t *testing.T) {
	formatted, err := formatFaceVector(nil, false)
	if err != nil || formatted != nil {
		t.Fatalf("expected an omitted optional vector, got value=%v error=%v", formatted, err)
	}
}

func TestParseYearMonthSupportsCombinedMonthQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("GET", "/attendance/history?month=2026-07", nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	year, month, err := parseYearMonth(c)
	if err != nil {
		t.Fatalf("parseYearMonth returned an error for combined month query: %v", err)
	}
	if year != 2026 || month != 7 {
		t.Fatalf("expected year=2026 month=7, got year=%d month=%d", year, month)
	}
}
