package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/Nattamon123/employee/backend/internal/domain"
	"github.com/Nattamon123/employee/backend/internal/repository"
)

type PosService struct {
	repo *repository.PosRepo
}

func NewPosService(repo *repository.PosRepo) *PosService {
	return &PosService{repo: repo}
}

func (s *PosService) GetUserBranchID(ctx context.Context, authID uuid.UUID) int {
	return s.repo.GetUserBranchID(ctx, authID)
}

func (s *PosService) GetCatalog(ctx context.Context, branchID int) (*domain.PosCatalogResponse, error) {
	return s.repo.GetCatalog(ctx, branchID)
}

func (s *PosService) GetFurnitureCatalog(ctx context.Context, branchID int) (*domain.PosCatalogResponse, error) {
	return s.repo.GetFurnitureCatalog(ctx, branchID)
}

func (s *PosService) GetSlabsCatalog(ctx context.Context, branchID int) (*domain.PosCatalogResponse, error) {
	return s.repo.GetSlabsCatalog(ctx, branchID)
}

func (s *PosService) CreateOrGetCustomProduct(ctx context.Context, input domain.CreateCustomProductInput, branchID int) (*domain.PosProduct, error) {
	return s.repo.CreateOrGetCustomProduct(ctx, input, branchID)
}

func (s *PosService) ValidateCoupon(ctx context.Context, code string, subtotal float64) (*domain.PosCouponInfo, error) {
	return s.repo.EvaluateCoupon(ctx, code, subtotal)
}

func (s *PosService) Checkout(ctx context.Context, userID uuid.UUID, branchID int, input domain.CheckoutInput) (*domain.CheckoutResult, error) {
	return s.repo.Checkout(ctx, userID, branchID, input)
}

func (s *PosService) CreateQuote(ctx context.Context, userID uuid.UUID, branchID int, input domain.QuoteInput) (*domain.QuoteResult, error) {
	return s.repo.CreateQuote(ctx, userID, branchID, input)
}

func (s *PosService) GetDispatches(ctx context.Context, branchID int, userID uuid.UUID) (*domain.GroupedDispatchesData, error) {
	return s.repo.GetDispatches(ctx, branchID, userID)
}

func (s *PosService) ApproveAndCutStock(ctx context.Context, orderID int64, customOrderCode string, userID uuid.UUID) (string, error) {
	return s.repo.ApproveAndCutStock(ctx, orderID, customOrderCode, userID)
}

func (s *PosService) MarkShipped(ctx context.Context, orderID int64, itemIDs []int64) error {
	return s.repo.MarkShipped(ctx, orderID, itemIDs)
}

func (s *PosService) CancelOrder(ctx context.Context, orderID int64, reason string, userID uuid.UUID) error {
	return s.repo.CancelOrder(ctx, orderID, reason, userID)
}

func (s *PosService) UpdateCustomer(ctx context.Context, input domain.UpdateCustomerInput) error {
	return s.repo.UpdateCustomer(ctx, input)
}
