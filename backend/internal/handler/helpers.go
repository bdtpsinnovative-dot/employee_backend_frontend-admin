package handler

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// parseDate แปลง string "2026-07-02" เป็น time.Time
func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", s)
}

// parseYearMonth ดึงค่า year และ month จาก query string
// รองรับทั้ง ?year=2026&month=7 และ ?month=2026-07
func parseYearMonth(c *gin.Context) (int, int, error) {
	if monthParam := c.Query("month"); monthParam != "" {
		if len(monthParam) == 7 {
			yearStr, monthStr := monthParam[:4], monthParam[5:]
			year, err := strconv.Atoi(yearStr)
			if err != nil {
				return 0, 0, err
			}
			month, err := strconv.Atoi(monthStr)
			if err != nil {
				return 0, 0, err
			}
			return year, month, nil
		}
	}

	yearStr := c.DefaultQuery("year", strconv.Itoa(time.Now().Year()))
	monthStr := c.DefaultQuery("month", strconv.Itoa(int(time.Now().Month())))

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		return 0, 0, err
	}

	month, err := strconv.Atoi(monthStr)
	if err != nil {
		return 0, 0, err
	}

	return year, month, nil
}
