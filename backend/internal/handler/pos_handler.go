package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/middleware"
	"github.com/Nattamon123/employee/backend/internal/service"
)

type PosHandler struct {
	svc *service.PosService
}

func NewPosHandler(svc *service.PosService) *PosHandler {
	return &PosHandler{svc: svc}
}

func (h *PosHandler) getUserInfo(c *gin.Context) (userID uuid.UUID, branchID int) {
	branchID = 1
	if cachedUser, ok := c.Get(middleware.ContextKeyUser); ok {
		if user, valid := cachedUser.(*domain.User); valid && user != nil {
			if user.AuthID != uuid.Nil {
				userID = user.AuthID
			} else {
				userID = user.ID
			}
			branchID = h.svc.GetUserBranchID(c.Request.Context(), user.AuthID)
			return
		}
	}
	if authIDVal, exists := c.Get(middleware.ContextKeyAuthID); exists {
		if authStr, ok := authIDVal.(string); ok {
			if parsed, err := uuid.Parse(authStr); err == nil {
				userID = parsed
				branchID = h.svc.GetUserBranchID(c.Request.Context(), parsed)
			}
		}
	}
	return
}

// GetProducts handles GET /api/pos/products
func (h *PosHandler) GetProducts(c *gin.Context) {
	_, branchID := h.getUserInfo(c)
	catalog, err := h.svc.GetCatalog(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "ไม่สามารถโหลดสินค้าได้: " + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, catalog)
}

// GetFurniture handles GET /api/pos/furniture
func (h *PosHandler) GetFurniture(c *gin.Context) {
	_, branchID := h.getUserInfo(c)
	catalog, err := h.svc.GetFurnitureCatalog(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "ไม่สามารถโหลดสินค้าเฟอร์นิเจอร์ได้: " + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, catalog)
}

// GetSlabs handles GET /api/pos/slabs
func (h *PosHandler) GetSlabs(c *gin.Context) {
	_, branchID := h.getUserInfo(c)
	catalog, err := h.svc.GetSlabsCatalog(c.Request.Context(), branchID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "ไม่สามารถโหลดสินค้าไม้แผ่น/สแลปได้: " + err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, catalog)
}

// CreateCustomProduct handles POST /api/pos/custom-product
func (h *PosHandler) CreateCustomProduct(c *gin.Context) {
	_, branchID := h.getUserInfo(c)
	var input domain.CreateCustomProductInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"message": "ข้อมูลสินค้าไม่ถูกต้อง",
		})
		return
	}

	product, err := h.svc.CreateOrGetCustomProduct(c.Request.Context(), input, branchID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"product": product,
	})
}

// ValidateCoupon handles POST /api/pos/coupons/validate
func (h *PosHandler) ValidateCoupon(c *gin.Context) {
	var body struct {
		Code     string  `json:"code"`
		Subtotal float64 `json:"subtotal"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"message": "ข้อมูลไม่ถูกต้อง",
		})
		return
	}

	coupon, err := h.svc.ValidateCoupon(c.Request.Context(), body.Code, body.Subtotal)
	if err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"coupon":  coupon,
	})
}

// Checkout handles POST /api/pos/checkout
func (h *PosHandler) Checkout(c *gin.Context) {
	userID, branchID := h.getUserInfo(c)
	var input domain.CheckoutInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"message": "ข้อมูลรายการขายไม่ถูกต้อง",
		})
		return
	}

	result, err := h.svc.Checkout(c.Request.Context(), userID, branchID, input)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, result)
}

// CreateQuote handles POST /api/pos/quotes
func (h *PosHandler) CreateQuote(c *gin.Context) {
	userID, branchID := h.getUserInfo(c)
	var input domain.QuoteInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"success": false,
			"message": "ข้อมูลใบเสนอราคาไม่ถูกต้อง",
		})
		return
	}

	result, err := h.svc.CreateQuote(c.Request.Context(), userID, branchID, input)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, result)
}

// GetDispatches handles GET /api/pos/dispatches
func (h *PosHandler) GetDispatches(c *gin.Context) {
	userID, branchID := h.getUserInfo(c)
	data, err := h.svc.GetDispatches(c.Request.Context(), branchID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "ดึงข้อมูลระบบจัดส่งไม่สำเร็จ: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    data,
	})
}

// ApproveDispatch handles POST /api/pos/dispatches/approve
func (h *PosHandler) ApproveDispatch(c *gin.Context) {
	userID, _ := h.getUserInfo(c)
	var input domain.ApproveDispatchInput
	if err := c.ShouldBindJSON(&input); err != nil || input.OrderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "ระบุรหัสคำสั่งซื้อไม่ถูกต้อง",
		})
		return
	}

	finalCode, err := h.svc.ApproveAndCutStock(c.Request.Context(), input.OrderID, input.CustomOrderCode, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"message":    "อนุมัติรับชำระเงินและหักสต็อกเรียบร้อยแล้ว",
		"order_code": finalCode,
	})
}

// ShipDispatch handles POST /api/pos/dispatches/ship
func (h *PosHandler) ShipDispatch(c *gin.Context) {
	var input domain.ShipDispatchInput
	if err := c.ShouldBindJSON(&input); err != nil || input.OrderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "ระบุรหัสคำสั่งซื้อไม่ถูกต้อง",
		})
		return
	}

	if err := h.svc.MarkShipped(c.Request.Context(), input.OrderID, input.ItemIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "บันทึกการส่งมอบสินค้าสำเร็จ",
	})
}

// CancelDispatch handles POST /api/pos/dispatches/cancel
func (h *PosHandler) CancelDispatch(c *gin.Context) {
	userID, _ := h.getUserInfo(c)
	var input domain.CancelDispatchInput
	if err := c.ShouldBindJSON(&input); err != nil || input.OrderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "ระบุรหัสคำสั่งซื้อไม่ถูกต้อง",
		})
		return
	}

	if err := h.svc.CancelOrder(c.Request.Context(), input.OrderID, input.Reason, userID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว",
	})
}

// UpdateCustomer handles POST /api/pos/dispatches/update-customer
func (h *PosHandler) UpdateCustomer(c *gin.Context) {
	var input domain.UpdateCustomerInput
	if err := c.ShouldBindJSON(&input); err != nil || input.OrderID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "ระบุรหัสคำสั่งซื้อไม่ถูกต้อง",
		})
		return
	}

	if err := h.svc.UpdateCustomer(c.Request.Context(), input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "อัปเดตข้อมูลลูกค้าเรียบร้อยแล้ว",
	})
}
