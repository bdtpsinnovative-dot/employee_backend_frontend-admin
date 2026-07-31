package middleware

import (
	"net/http"
	"sync/atomic"

	"github.com/gin-gonic/gin"
)

// MaintenanceGate blocks writes while a full restore is in progress.
type MaintenanceGate struct {
	active atomic.Bool
}

func NewMaintenanceGate() *MaintenanceGate {
	return &MaintenanceGate{}
}

func (g *MaintenanceGate) Enable() {
	g.active.Store(true)
}

func (g *MaintenanceGate) Disable() {
	g.active.Store(false)
}

func (g *MaintenanceGate) Active() bool {
	return g.active.Load()
}

// ReadOnlyDuringRestore allows reads and blocks mutations during restore.
func (g *MaintenanceGate) ReadOnlyDuringRestore() gin.HandlerFunc {
	return func(c *gin.Context) {
		if g.Active() && c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead && c.Request.Method != http.MethodOptions {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"error":    "ระบบกำลังกู้คืนข้อมูล กรุณาลองใหม่ภายหลัง",
				"code":     "restore_in_progress",
				"readonly": true,
			})
			return
		}
		c.Next()
	}
}
