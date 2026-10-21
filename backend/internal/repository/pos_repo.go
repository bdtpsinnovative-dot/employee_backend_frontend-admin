package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
	"github.com/Nattamon123/employee/backend/internal/domain"
)

type PosRepo struct {
	db *sqlx.DB
}

func NewPosRepo(db *sqlx.DB) *PosRepo {
	return &PosRepo{db: db}
}

// GetUserBranchID returns the branch ID for the given auth user ID from profiles
func (r *PosRepo) GetUserBranchID(ctx context.Context, authID uuid.UUID) int {
	var branchID sql.NullInt64
	err := r.db.GetContext(ctx, &branchID, `SELECT branch_id FROM profiles WHERE user_id = $1 LIMIT 1`, authID)
	if err != nil || !branchID.Valid || branchID.Int64 <= 0 {
		return 1 // Default to branch 1
	}
	return int(branchID.Int64)
}

// GetBranches returns all branches
func (r *PosRepo) GetBranches(ctx context.Context) ([]domain.PosBranchInfo, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT id, branch_name FROM branches ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []domain.PosBranchInfo
	for rows.Next() {
		var b domain.PosBranchInfo
		var name sql.NullString
		if err := rows.Scan(&b.ID, &name); err != nil {
			return nil, err
		}
		if name.Valid {
			b.Name = name.String
		} else {
			b.Name = fmt.Sprintf("สาขา #%d", b.ID)
		}
		branches = append(branches, b)
	}
	return branches, nil
}

// GetCatalog loads products with stock, branch stocks, and active discounts
func (r *PosRepo) GetCatalog(ctx context.Context, ownBranchID int) (*domain.PosCatalogResponse, error) {
	branches, err := r.GetBranches(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load branches: %w", err)
	}

	branchMap := make(map[int]string)
	for _, b := range branches {
		branchMap[b.ID] = b.Name
	}

	type ProductRow struct {
		ID            int64           `db:"id"`
		Name          string          `db:"name"`
		Sku           sql.NullString  `db:"sku"`
		Barcode       sql.NullString  `db:"barcode"`
		Price         sql.NullFloat64 `db:"price"`
		ImageURL      sql.NullString  `db:"image_url"`
		ProductSup    sql.NullString  `db:"product_sup"`
		CgImageURL    sql.NullString  `db:"cg_image_url"`
		CgCoverImage  sql.NullString  `db:"cg_cover_image"`
	}

	query := `
		SELECT 
			p.id, 
			p.name, 
			p.sku, 
			p.barcode, 
			p.price, 
			p.image_url,
			cg.product_sup, 
			cg.image_url as cg_image_url, 
			cg.cover_image_url as cg_cover_image
		FROM products p
		LEFT JOIN collection_groups cg ON cg.id = p.collection_group_id
		WHERE p.category_id = 'prop'
		ORDER BY p.id ASC
		LIMIT 1000
	`

	var rawProducts []ProductRow
	if err := r.db.SelectContext(ctx, &rawProducts, query); err != nil {
		return nil, fmt.Errorf("failed to query products: %w", err)
	}

	if len(rawProducts) == 0 {
		return &domain.PosCatalogResponse{
			Success:    true,
			Products:   []domain.PosProduct{},
			Categories: []string{},
			Branches:   branches,
			BranchID:   ownBranchID,
			BranchName: branchMap[ownBranchID],
		}, nil
	}

	productIDs := make([]int64, len(rawProducts))
	for i, p := range rawProducts {
		productIDs[i] = p.ID
	}

	// 1. Fetch stocks
	type StockRow struct {
		ProductID int64           `db:"product_id"`
		BranchID  int             `db:"branch_id"`
		Qty       sql.NullFloat64 `db:"qty"`
	}
	var stockRows []StockRow
	stockQuery, stockArgs, err := sqlx.In(`SELECT product_id, branch_id, qty FROM stock WHERE product_id IN (?)`, productIDs)
	if err == nil {
		stockQuery = r.db.Rebind(stockQuery)
		_ = r.db.SelectContext(ctx, &stockRows, stockQuery, stockArgs...)
	}

	stockMap := make(map[int64][]StockRow)
	for _, s := range stockRows {
		stockMap[s.ProductID] = append(stockMap[s.ProductID], s)
	}

	// 2. Fetch active discounts
	type DiscRuleRow struct {
		ProductID    int64           `db:"product_id"`
		DiscountID   int64           `db:"discount_id"`
		Name         string          `db:"name"`
		DiscountType string          `db:"discount_type"`
		Value        sql.NullFloat64 `db:"value"`
		Active       bool            `db:"active"`
	}
	var discRows []DiscRuleRow
	discQuery, discArgs, err := sqlx.In(`
		SELECT dr.product_id, d.id as discount_id, d.name, d.discount_type, d.value, d.active
		FROM discount_rules dr
		JOIN discounts d ON d.id = dr.discount_id
		WHERE dr.product_id IN (?) AND d.active = true
	`, productIDs)
	if err == nil {
		discQuery = r.db.Rebind(discQuery)
		_ = r.db.SelectContext(ctx, &discRows, discQuery, discArgs...)
	}

	discMap := make(map[int64]*DiscRuleRow)
	for _, d := range discRows {
		if _, exists := discMap[d.ProductID]; !exists {
			rowCopy := d
			discMap[d.ProductID] = &rowCopy
		}
	}

	// Build products
	categorySet := make(map[string]bool)
	var products []domain.PosProduct

	for _, p := range rawProducts {
		origPrice := 0.0
		if p.Price.Valid {
			origPrice = p.Price.Float64
		}
		finalPrice := origPrice
		discountLabel := ""
		var discID *int64
		var discName *string

		if disc, ok := discMap[p.ID]; ok && disc != nil {
			val := 0.0
			if disc.Value.Valid {
				val = disc.Value.Float64
			}
			discID = &disc.DiscountID
			nameCopy := disc.Name
			discName = &nameCopy

			if strings.EqualFold(disc.DiscountType, "FIXED") {
				finalPrice = math.Max(0, origPrice-val)
				if origPrice > 0 {
					discountLabel = fmt.Sprintf("-%d%%", int(math.Round((val/origPrice)*100)))
				}
			} else if strings.EqualFold(disc.DiscountType, "PERCENT") {
				finalPrice = math.Max(0, origPrice-(origPrice*(val/100.0)))
				discountLabel = fmt.Sprintf("-%d%%", int(math.Round(val)))
			}
		}

		var resolvedImage *string
		if p.ImageURL.Valid && p.ImageURL.String != "" {
			s := p.ImageURL.String
			resolvedImage = &s
		} else if p.CgImageURL.Valid && p.CgImageURL.String != "" {
			s := p.CgImageURL.String
			resolvedImage = &s
		} else if p.CgCoverImage.Valid && p.CgCoverImage.String != "" {
			s := p.CgCoverImage.String
			resolvedImage = &s
		}

		// Calculate stocks
		ownQty := 0
		otherQty := 0
		var detailedStocks []domain.ProductBranchStock

		for _, s := range stockMap[p.ID] {
			qty := 0
			if s.Qty.Valid {
				qty = int(s.Qty.Float64)
			}
			isOwn := s.BranchID == ownBranchID
			if isOwn {
				ownQty = qty
			} else {
				otherQty += qty
			}
			bName := branchMap[s.BranchID]
			if bName == "" {
				bName = fmt.Sprintf("สาขา #%d", s.BranchID)
			}
			detailedStocks = append(detailedStocks, domain.ProductBranchStock{
				BranchID:    s.BranchID,
				BranchName:  bName,
				Qty:         qty,
				IsOwnBranch: isOwn,
			})
		}

		rawCat := ""
		if p.ProductSup.Valid {
			rawCat = strings.TrimSpace(p.ProductSup.String)
		}
		if rawCat == "" {
			rawCat = "อื่น ๆ"
		}
		categorySet[rawCat] = true

		products = append(products, domain.PosProduct{
			ID:             p.ID,
			Name:           p.Name,
			Sku:            p.Sku.String,
			Barcode:        p.Barcode.String,
			OriginalPrice:  origPrice,
			Price:          finalPrice,
			DiscountLabel:  discountLabel,
			DiscountID:     discID,
			DiscountName:   discName,
			ImageURL:       resolvedImage,
			ProductSup:     rawCat,
			AvailableQty:   ownQty,
			OwnBranchQty:   ownQty,
			OtherBranchQty: otherQty,
			TotalStock:     ownQty + otherQty,
			Stocks:         detailedStocks,
		})
	}

	categories := make([]string, 0, len(categorySet))
	for c := range categorySet {
		categories = append(categories, c)
	}
	sort.Strings(categories)

	ownBranchName := branchMap[ownBranchID]
	if ownBranchName == "" {
		ownBranchName = "สาขาหลัก"
	}

	return &domain.PosCatalogResponse{
		Success:    true,
		Products:   products,
		Categories: categories,
		Branches:   branches,
		BranchID:   ownBranchID,
		BranchName: ownBranchName,
	}, nil
}

// GetFurnitureCatalog loads furniture products with stock, branch stocks, and active discounts
func (r *PosRepo) GetFurnitureCatalog(ctx context.Context, ownBranchID int) (*domain.PosCatalogResponse, error) {
	branches, err := r.GetBranches(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load branches: %w", err)
	}

	branchMap := make(map[int]string)
	for _, b := range branches {
		branchMap[b.ID] = b.Name
	}

	type ProductRow struct {
		ID           int64           `db:"id"`
		Name         string          `db:"name"`
		Sku          sql.NullString  `db:"sku"`
		Barcode      sql.NullString  `db:"barcode"`
		Price        sql.NullFloat64 `db:"price"`
		ImageURL     sql.NullString  `db:"image_url"`
		ProductSup   sql.NullString  `db:"product_sup"`
		CgImageURL   sql.NullString  `db:"cg_image_url"`
		CgCoverImage sql.NullString  `db:"cg_cover_image"`
	}

	query := `
		SELECT 
			p.id, 
			p.name, 
			p.sku, 
			p.barcode, 
			p.price, 
			p.image_url,
			cg.product_sup, 
			cg.image_url as cg_image_url, 
			cg.cover_image_url as cg_cover_image
		FROM products p
		LEFT JOIN collection_groups cg ON cg.id = p.collection_group_id
		WHERE p.category_id = 'furniture'
		ORDER BY p.name ASC
		LIMIT 1000
	`

	var rawProducts []ProductRow
	if err := r.db.SelectContext(ctx, &rawProducts, query); err != nil {
		return nil, fmt.Errorf("failed to query furniture products: %w", err)
	}

	if len(rawProducts) == 0 {
		return &domain.PosCatalogResponse{
			Success:    true,
			Products:   []domain.PosProduct{},
			Categories: []string{},
			Branches:   branches,
			BranchID:   ownBranchID,
			BranchName: branchMap[ownBranchID],
		}, nil
	}

	productIDs := make([]int64, len(rawProducts))
	for i, p := range rawProducts {
		productIDs[i] = p.ID
	}

	// 1. Fetch stocks
	type StockRow struct {
		ProductID int64           `db:"product_id"`
		BranchID  int             `db:"branch_id"`
		Qty       sql.NullFloat64 `db:"qty"`
	}
	var stockRows []StockRow
	stockQuery, stockArgs, err := sqlx.In(`SELECT product_id, branch_id, qty FROM stock WHERE product_id IN (?)`, productIDs)
	if err == nil {
		stockQuery = r.db.Rebind(stockQuery)
		_ = r.db.SelectContext(ctx, &stockRows, stockQuery, stockArgs...)
	}

	stockMap := make(map[int64][]StockRow)
	for _, s := range stockRows {
		stockMap[s.ProductID] = append(stockMap[s.ProductID], s)
	}

	// Build products
	categorySet := make(map[string]bool)
	var products []domain.PosProduct

	for _, p := range rawProducts {
		origPrice := 0.0
		if p.Price.Valid {
			origPrice = p.Price.Float64
		}
		finalPrice := origPrice

		var resolvedImage *string
		if p.ImageURL.Valid && strings.TrimSpace(p.ImageURL.String) != "" {
			img := p.ImageURL.String
			resolvedImage = &img
		} else if p.CgImageURL.Valid && strings.TrimSpace(p.CgImageURL.String) != "" {
			img := p.CgImageURL.String
			resolvedImage = &img
		} else if p.CgCoverImage.Valid && strings.TrimSpace(p.CgCoverImage.String) != "" {
			img := p.CgCoverImage.String
			resolvedImage = &img
		}

		// Calculate stocks per branch
		pStocks := stockMap[p.ID]
		branchQtyMap := make(map[int]int)
		for _, s := range pStocks {
			q := 0
			if s.Qty.Valid {
				q = int(s.Qty.Float64)
			}
			branchQtyMap[s.BranchID] = q
		}

		ownQty := branchQtyMap[ownBranchID]
		otherQty := 0
		var detailedStocks []domain.ProductBranchStock
		for _, b := range branches {
			qty := branchQtyMap[b.ID]
			isOwn := b.ID == ownBranchID
			if !isOwn {
				otherQty += qty
			}
			bName := b.Name
			if isOwn {
				bName = fmt.Sprintf("%s (สาขาเรา)", b.Name)
			}
			detailedStocks = append(detailedStocks, domain.ProductBranchStock{
				BranchID:    b.ID,
				BranchName:  bName,
				Qty:         qty,
				IsOwnBranch: isOwn,
			})
		}

		rawCat := ""
		if p.ProductSup.Valid {
			rawCat = strings.TrimSpace(p.ProductSup.String)
		}
		if rawCat == "" {
			rawCat = "เฟอร์นิเจอร์ทั่วไป"
		}
		categorySet[rawCat] = true

		products = append(products, domain.PosProduct{
			ID:             p.ID,
			Name:           p.Name,
			Sku:            p.Sku.String,
			Barcode:        p.Barcode.String,
			OriginalPrice:  origPrice,
			Price:          finalPrice,
			ImageURL:       resolvedImage,
			ProductSup:     rawCat,
			AvailableQty:   ownQty,
			OwnBranchQty:   ownQty,
			OtherBranchQty: otherQty,
			TotalStock:     ownQty + otherQty,
			IsFurniture:    true,
			Stocks:         detailedStocks,
		})
	}

	categories := make([]string, 0, len(categorySet))
	for c := range categorySet {
		categories = append(categories, c)
	}
	sort.Strings(categories)

	ownBranchName := branchMap[ownBranchID]
	if ownBranchName == "" {
		ownBranchName = "สาขาหลัก"
	}

	return &domain.PosCatalogResponse{
		Success:    true,
		Products:   products,
		Categories: categories,
		Branches:   branches,
		BranchID:   ownBranchID,
		BranchName: ownBranchName,
	}, nil
}

// GetSlabsCatalog loads slab products (category_id = 'SLABS')
func (r *PosRepo) GetSlabsCatalog(ctx context.Context, ownBranchID int) (*domain.PosCatalogResponse, error) {
	branches, err := r.GetBranches(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load branches: %w", err)
	}

	branchMap := make(map[int]string)
	for _, b := range branches {
		branchMap[b.ID] = b.Name
	}

	type ProductRow struct {
		ID           int64           `db:"id"`
		Name         string          `db:"name"`
		Sku          sql.NullString  `db:"sku"`
		Barcode      sql.NullString  `db:"barcode"`
		Price        sql.NullFloat64 `db:"price"`
		ImageURL     sql.NullString  `db:"image_url"`
		ProductSup   sql.NullString  `db:"product_sup"`
		CgImageURL   sql.NullString  `db:"cg_image_url"`
		CgCoverImage sql.NullString  `db:"cg_cover_image"`
	}

	query := `
		SELECT 
			p.id, 
			p.name, 
			p.sku, 
			p.barcode, 
			p.price, 
			p.image_url,
			cg.product_sup, 
			cg.image_url as cg_image_url, 
			cg.cover_image_url as cg_cover_image
		FROM products p
		LEFT JOIN collection_groups cg ON cg.id = p.collection_group_id
		WHERE p.category_id = 'SLABS'
		ORDER BY p.name ASC
		LIMIT 1500
	`

	var rawProducts []ProductRow
	if err := r.db.SelectContext(ctx, &rawProducts, query); err != nil {
		return nil, fmt.Errorf("failed to query slab products: %w", err)
	}

	if len(rawProducts) == 0 {
		return &domain.PosCatalogResponse{
			Success:    true,
			Products:   []domain.PosProduct{},
			Categories: []string{},
			Branches:   branches,
			BranchID:   ownBranchID,
			BranchName: branchMap[ownBranchID],
		}, nil
	}

	productIDs := make([]int64, len(rawProducts))
	for i, p := range rawProducts {
		productIDs[i] = p.ID
	}

	// Fetch stocks
	type StockRow struct {
		ProductID int64           `db:"product_id"`
		BranchID  int             `db:"branch_id"`
		Qty       sql.NullFloat64 `db:"qty"`
	}
	var stockRows []StockRow
	stockQuery, stockArgs, err := sqlx.In(`SELECT product_id, branch_id, qty FROM stock WHERE product_id IN (?)`, productIDs)
	if err == nil {
		stockQuery = r.db.Rebind(stockQuery)
		_ = r.db.SelectContext(ctx, &stockRows, stockQuery, stockArgs...)
	}

	stockMap := make(map[int64][]StockRow)
	for _, s := range stockRows {
		stockMap[s.ProductID] = append(stockMap[s.ProductID], s)
	}

	categorySet := make(map[string]bool)
	var products []domain.PosProduct

	for _, p := range rawProducts {
		origPrice := 0.0
		if p.Price.Valid {
			origPrice = p.Price.Float64
		}
		finalPrice := origPrice

		var resolvedImage *string
		if p.ImageURL.Valid && strings.TrimSpace(p.ImageURL.String) != "" {
			img := p.ImageURL.String
			resolvedImage = &img
		} else if p.CgImageURL.Valid && strings.TrimSpace(p.CgImageURL.String) != "" {
			img := p.CgImageURL.String
			resolvedImage = &img
		} else if p.CgCoverImage.Valid && strings.TrimSpace(p.CgCoverImage.String) != "" {
			img := p.CgCoverImage.String
			resolvedImage = &img
		}

		pStocks := stockMap[p.ID]
		branchQtyMap := make(map[int]int)
		for _, s := range pStocks {
			q := 0
			if s.Qty.Valid {
				q = int(s.Qty.Float64)
			}
			branchQtyMap[s.BranchID] = q
		}

		ownQty := branchQtyMap[ownBranchID]
		otherQty := 0
		var detailedStocks []domain.ProductBranchStock
		for _, b := range branches {
			qty := branchQtyMap[b.ID]
			isOwn := b.ID == ownBranchID
			if !isOwn {
				otherQty += qty
			}
			bName := b.Name
			if isOwn {
				bName = fmt.Sprintf("%s (สาขาเรา)", b.Name)
			}
			detailedStocks = append(detailedStocks, domain.ProductBranchStock{
				BranchID:    b.ID,
				BranchName:  bName,
				Qty:         qty,
				IsOwnBranch: isOwn,
			})
		}

		rawCat := ""
		lowerName := strings.ToLower(p.Name)
		skuLower := strings.ToLower(p.Sku.String)
		if strings.Contains(lowerName, "walnut") {
			rawCat = "Black Walnut"
		} else if strings.Contains(lowerName, "oak") {
			rawCat = "White Oak"
		} else if strings.Contains(lowerName, "teak") {
			rawCat = "Teak (ไม้สัก)"
		} else if strings.Contains(lowerName, "afromosia") {
			rawCat = "Afromosia"
		} else if strings.Contains(lowerName, "maple") {
			rawCat = "Maple Wood"
		} else if strings.Contains(lowerName, "poplar") {
			rawCat = "Poplar Wood"
		} else if strings.Contains(lowerName, "sandalwood") {
			rawCat = "Sandalwood"
		} else if strings.Contains(lowerName, "stand") || strings.Contains(lowerName, "leg") || strings.Contains(skuLower, "leg") {
			rawCat = "ขาโต๊ะ / ขาตั้ง (Leg & Stand)"
		} else if strings.Contains(lowerName, "table") {
			rawCat = "โต๊ะไม้แผ่นสำเร็จ"
		} else {
			rawCat = "ไม้แผ่นชนิดอื่น"
		}
		categorySet[rawCat] = true

		products = append(products, domain.PosProduct{
			ID:             p.ID,
			Name:           p.Name,
			Sku:            p.Sku.String,
			Barcode:        p.Barcode.String,
			OriginalPrice:  origPrice,
			Price:          finalPrice,
			ImageURL:       resolvedImage,
			ProductSup:     rawCat,
			AvailableQty:   ownQty,
			OwnBranchQty:   ownQty,
			OtherBranchQty: otherQty,
			TotalStock:     ownQty + otherQty,
			IsFurniture:    false,
			Stocks:         detailedStocks,
		})
	}

	categories := make([]string, 0, len(categorySet))
	for c := range categorySet {
		categories = append(categories, c)
	}
	sort.Strings(categories)

	ownBranchName := branchMap[ownBranchID]
	if ownBranchName == "" {
		ownBranchName = "สาขาหลัก"
	}

	return &domain.PosCatalogResponse{
		Success:    true,
		Products:   products,
		Categories: categories,
		Branches:   branches,
		BranchID:   ownBranchID,
		BranchName: ownBranchName,
	}, nil
}

// CreateOrGetCustomProduct creates or fetches a custom made-to-order item and assigns stock
func (r *PosRepo) CreateOrGetCustomProduct(ctx context.Context, input domain.CreateCustomProductInput, userBranchID int) (*domain.PosProduct, error) {
	cleanName := strings.TrimSpace(input.Name)
	if cleanName == "" {
		return nil, fmt.Errorf("กรุณาระบุชื่อสินค้า")
	}
	cleanPrice := math.Max(0, input.Price)
	cleanSKU := strings.TrimSpace(input.SKU)
	if cleanSKU == "" {
		cleanSKU = fmt.Sprintf("EXT-%d", time.Now().UnixNano()%1000000)
	}
	branchID := input.BranchID
	if branchID <= 0 {
		branchID = userBranchID
	}
	if branchID <= 0 {
		branchID = 1
	}

	categoryLabel := strings.TrimSpace(input.CategoryLabel)
	if categoryLabel == "" {
		categoryLabel = "เฟอร์นิเจอร์สั่งทำ"
	}
	categoryID := "furniture"
	if strings.Contains(strings.ToLower(categoryLabel), "prop") {
		categoryID = "prop"
	}
	unit := strings.TrimSpace(input.Unit)
	if unit == "" {
		unit = "ชิ้น"
	}

	type ProdRow struct {
		ID       int64           `db:"id"`
		Name     string          `db:"name"`
		Sku      sql.NullString  `db:"sku"`
		Barcode  sql.NullString  `db:"barcode"`
		Price    sql.NullFloat64 `db:"price"`
		ImageURL sql.NullString  `db:"image_url"`
	}

	var product ProdRow
	// 1. Check if SKU already exists
	err := r.db.GetContext(ctx, &product, `SELECT id, name, sku, barcode, price, image_url FROM products WHERE sku = $1 LIMIT 1`, cleanSKU)
	if err != nil {
		// 2. Insert new product
		specsMap := map[string]interface{}{
			"is_custom":      true,
			"note":           input.Note,
			"category_label": categoryLabel,
		}
		specsJSON, _ := json.Marshal(specsMap)

		insertQuery := `
			INSERT INTO products (name, sku, price, unit, category_id, status, specs)
			VALUES ($1, $2, $3, $4, $5, 'active', $6)
			RETURNING id, name, sku, barcode, price, image_url
		`
		if err := r.db.GetContext(ctx, &product, insertQuery, cleanName, cleanSKU, cleanPrice, unit, categoryID, specsJSON); err != nil {
			return nil, fmt.Errorf("ไม่สามารถสร้างสินค้านอกระบบได้: %w", err)
		}
	}

	// 3. Upsert initial stock 999 for this branch
	_, _ = r.db.ExecContext(ctx, `
		INSERT INTO stock (product_id, branch_id, qty)
		VALUES ($1, $2, 999)
		ON CONFLICT (product_id, branch_id) DO UPDATE SET qty = 999
	`, product.ID, branchID)

	branches, _ := r.GetBranches(ctx)
	var detailedStocks []domain.ProductBranchStock
	for _, b := range branches {
		qty := 0
		if b.ID == branchID {
			qty = 999
		}
		isOwn := b.ID == userBranchID
		bName := b.Name
		if isOwn {
			bName = fmt.Sprintf("%s (สาขาเรา)", b.Name)
		}
		detailedStocks = append(detailedStocks, domain.ProductBranchStock{
			BranchID:    b.ID,
			BranchName:  bName,
			Qty:         qty,
			IsOwnBranch: isOwn,
		})
	}

	var imgPtr *string
	if product.ImageURL.Valid && strings.TrimSpace(product.ImageURL.String) != "" {
		s := product.ImageURL.String
		imgPtr = &s
	}

	return &domain.PosProduct{
		ID:             product.ID,
		Name:           product.Name,
		Sku:            product.Sku.String,
		Barcode:        product.Barcode.String,
		OriginalPrice:  cleanPrice,
		Price:          cleanPrice,
		ImageURL:       imgPtr,
		ProductSup:     categoryLabel,
		AvailableQty:   999,
		OwnBranchQty:   999,
		OtherBranchQty: 0,
		TotalStock:     999,
		IsFurniture:    categoryID == "furniture",
		IsExternal:     true,
		Stocks:         detailedStocks,
	}, nil
}

// EvaluateCoupon evaluates a coupon code against terra_collection_promotions and discounts
func (r *PosRepo) EvaluateCoupon(ctx context.Context, code string, subtotal float64) (*domain.PosCouponInfo, error) {
	cleanCode := strings.ToUpper(strings.TrimSpace(code))
	if cleanCode == "" {
		return nil, fmt.Errorf("กรุณาระบุรหัสคูปอง")
	}

	now := time.Now()

	// 1. Check terra_collection_promotions
	type TerraPromo struct {
		ID                uuid.UUID       `db:"id"`
		Title             string          `db:"title"`
		CouponCode        string          `db:"coupon_code"`
		DiscountType      string          `db:"discount_type"`
		DiscountValue     float64         `db:"discount_value"`
		MaxDiscountAmount sql.NullFloat64 `db:"max_discount_amount"`
		StartDate         *time.Time      `db:"start_date"`
		EndDate           *time.Time      `db:"end_date"`
		UsageLimit        sql.NullInt64   `db:"usage_limit"`
		UsedCount         int             `db:"used_count"`
		MinSpend          sql.NullFloat64 `db:"min_spend"`
	}

	var promos []TerraPromo
	err := r.db.SelectContext(ctx, &promos, `
		SELECT id, title, coupon_code, discount_type, discount_value, max_discount_amount,
		       start_date, end_date, usage_limit, used_count, min_spend
		FROM terra_collection_promotions
		WHERE UPPER(coupon_code) = $1 AND is_active = true
		LIMIT 1
	`, cleanCode)

	if err == nil && len(promos) > 0 {
		p := promos[0]
		if p.StartDate != nil && p.StartDate.After(now) {
			return nil, fmt.Errorf("คูปองนี้ยังไม่เริ่มใช้งาน")
		}
		if p.EndDate != nil && p.EndDate.Before(now) {
			return nil, fmt.Errorf("คูปองนี้หมดอายุแล้ว")
		}
		if p.UsageLimit.Valid && int64(p.UsedCount) >= p.UsageLimit.Int64 {
			return nil, fmt.Errorf("คูปองนี้ถูกใช้งานครบจำนวนสิทธิ์แล้ว")
		}
		minSpend := 0.0
		if p.MinSpend.Valid {
			minSpend = p.MinSpend.Float64
		}
		if minSpend > 0 && subtotal < minSpend {
			return nil, fmt.Errorf("ยอดซื้อต้องครบ ฿%.0f ขึ้นไป (ยอดปัจจุบัน ฿%.0f)", minSpend, subtotal)
		}

		discountAmount := 0.0
		if strings.EqualFold(p.DiscountType, "percentage") {
			discountAmount = (subtotal * p.DiscountValue) / 100.0
			if p.MaxDiscountAmount.Valid && discountAmount > p.MaxDiscountAmount.Float64 {
				discountAmount = p.MaxDiscountAmount.Float64
			}
		} else {
			discountAmount = math.Min(subtotal, p.DiscountValue)
		}

		return &domain.PosCouponInfo{
			ID:             p.ID.String(),
			Code:           cleanCode,
			Title:          p.Title,
			DiscountType:   p.DiscountType,
			DiscountValue:  p.DiscountValue,
			DiscountAmount: math.Round(discountAmount),
			Source:         "terra",
		}, nil
	}

	// 2. Check discounts table
	type PosDiscount struct {
		ID           int64           `db:"id"`
		Name         string          `db:"name"`
		Code         sql.NullString  `db:"code"`
		DiscountType string          `db:"discount_type"`
		Value        sql.NullFloat64 `db:"value"`
	}

	var posDiscounts []PosDiscount
	err = r.db.SelectContext(ctx, &posDiscounts, `
		SELECT id, name, code, discount_type, value
		FROM discounts
		WHERE UPPER(code) = $1 AND active = true
		LIMIT 1
	`, cleanCode)

	if err == nil && len(posDiscounts) > 0 {
		d := posDiscounts[0]
		val := 0.0
		if d.Value.Valid {
			val = d.Value.Float64
		}
		discountAmount := 0.0
		discType := "fixed_amount"
		if strings.EqualFold(d.DiscountType, "PERCENT") {
			discType = "percentage"
			discountAmount = (subtotal * val) / 100.0
		} else {
			discountAmount = math.Min(subtotal, val)
		}

		return &domain.PosCouponInfo{
			ID:             d.ID,
			Code:           cleanCode,
			Title:          d.Name,
			DiscountType:   discType,
			DiscountValue:  val,
			DiscountAmount: math.Round(discountAmount),
			Source:         "pos",
		}, nil
	}

	return nil, fmt.Errorf("ไม่พบรหัสคูปองนี้ หรือคูปองหมดอายุแล้ว")
}

// Checkout performs atomic checkout: verifies stock, calculates discounts/taxes, inserts order and transfer tickets
func (r *PosRepo) Checkout(ctx context.Context, userID uuid.UUID, userBranchID int, input domain.CheckoutInput) (*domain.CheckoutResult, error) {
	if len(input.Items) == 0 {
		return nil, fmt.Errorf("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ")
	}

	// Group duplicate items
	type AggItem struct {
		ProductID       int64
		Quantity        int
		FulfillBranchID int
	}
	itemMap := make(map[string]*AggItem)
	var productIDs []int64

	for _, item := range input.Items {
		if item.ProductID <= 0 || item.Quantity <= 0 {
			return nil, fmt.Errorf("รายการสินค้าไม่ถูกต้อง")
		}
		fBranch := item.FulfillBranchID
		if fBranch <= 0 {
			fBranch = userBranchID
		}
		key := fmt.Sprintf("%d_%d", item.ProductID, fBranch)
		if existing, ok := itemMap[key]; ok {
			existing.Quantity += item.Quantity
		} else {
			itemMap[key] = &AggItem{
				ProductID:       item.ProductID,
				Quantity:        item.Quantity,
				FulfillBranchID: fBranch,
			}
			productIDs = append(productIDs, item.ProductID)
		}
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Query products
	type ProdInfo struct {
		ID    int64           `db:"id"`
		Name  string          `db:"name"`
		Price sql.NullFloat64 `db:"price"`
	}
	var prods []ProdInfo
	pQuery, pArgs, err := sqlx.In(`SELECT id, name, price FROM products WHERE id IN (?)`, productIDs)
	if err != nil {
		return nil, fmt.Errorf("invalid query params: %w", err)
	}
	pQuery = tx.Rebind(pQuery)
	if err := tx.SelectContext(ctx, &prods, pQuery, pArgs...); err != nil {
		return nil, fmt.Errorf("failed to fetch products: %w", err)
	}
	if len(prods) == 0 {
		return nil, fmt.Errorf("พบสินค้าที่ไม่สามารถทำรายการได้")
	}

	prodLookup := make(map[int64]ProdInfo)
	for _, p := range prods {
		prodLookup[p.ID] = p
	}

	// Fetch active discounts for these products
	type DiscRuleRow struct {
		ProductID    int64           `db:"product_id"`
		DiscountID   int64           `db:"discount_id"`
		Name         string          `db:"name"`
		DiscountType string          `db:"discount_type"`
		Value        sql.NullFloat64 `db:"value"`
	}
	var discRows []DiscRuleRow
	dQuery, dArgs, err := sqlx.In(`
		SELECT dr.product_id, d.id as discount_id, d.name, d.discount_type, d.value
		FROM discount_rules dr
		JOIN discounts d ON d.id = dr.discount_id
		WHERE dr.product_id IN (?) AND d.active = true
	`, productIDs)
	if err == nil {
		dQuery = tx.Rebind(dQuery)
		_ = tx.SelectContext(ctx, &discRows, dQuery, dArgs...)
	}
	discLookup := make(map[int64]DiscRuleRow)
	for _, d := range discRows {
		if _, ok := discLookup[d.ProductID]; !ok {
			discLookup[d.ProductID] = d
		}
	}

	type LineItem struct {
		ProductID        int64
		Name             string
		Quantity         int
		OriginalPrice    float64
		Price            float64
		Total            float64
		FulfillBranchID  int
		IsCrossBranch    bool
		DiscountID       *int64
		DiscountName     *string
		DiscountPerPiece float64
	}

	var lineItems []LineItem
	for _, item := range itemMap {
		prod, ok := prodLookup[item.ProductID]
		if !ok {
			return nil, fmt.Errorf("ไม่พบสินค้ารหัส #%d", item.ProductID)
		}

		// Verify stock in fulfill branch
		var currentStock sql.NullFloat64
		err := tx.GetContext(ctx, &currentStock, `SELECT qty FROM stock WHERE product_id = $1 AND branch_id = $2`, item.ProductID, item.FulfillBranchID)
		available := 0
		if err == nil && currentStock.Valid {
			available = int(currentStock.Float64)
		} else {
			// If stock doesn't exist yet, check if product is custom or non-prop
			var isCustom bool
			_ = tx.GetContext(ctx, &isCustom, `SELECT COALESCE((specs->>'is_custom')::boolean, false) FROM products WHERE id = $1`, item.ProductID)
			if isCustom {
				_, _ = tx.ExecContext(ctx, `INSERT INTO stock (product_id, branch_id, qty) VALUES ($1, $2, 999) ON CONFLICT (product_id, branch_id) DO UPDATE SET qty = 999`, item.ProductID, item.FulfillBranchID)
				available = 999
			}
		}
		if available < item.Quantity {
			return nil, fmt.Errorf("สินค้า %s ในสาขาที่เลือกมีสต็อกไม่เพียงพอ (คงเหลือ %d ชิ้น)", prod.Name, available)
		}

		origPrice := 0.0
		if prod.Price.Valid {
			origPrice = prod.Price.Float64
		}
		finalPrice := origPrice
		var discID *int64
		var discName *string
		discPerPiece := 0.0

		if disc, ok := discLookup[item.ProductID]; ok {
			val := 0.0
			if disc.Value.Valid {
				val = disc.Value.Float64
			}
			discID = &disc.DiscountID
			dName := disc.Name
			discName = &dName
			if strings.EqualFold(disc.DiscountType, "FIXED") {
				finalPrice = math.Max(0, origPrice-val)
			} else if strings.EqualFold(disc.DiscountType, "PERCENT") {
				finalPrice = math.Max(0, origPrice-(origPrice*(val/100.0)))
			}
			discPerPiece = math.Max(0, origPrice-finalPrice)
		}

		lineItems = append(lineItems, LineItem{
			ProductID:        item.ProductID,
			Name:             prod.Name,
			Quantity:         item.Quantity,
			OriginalPrice:    origPrice,
			Price:            finalPrice,
			Total:            finalPrice * float64(item.Quantity),
			FulfillBranchID:  item.FulfillBranchID,
			IsCrossBranch:    item.FulfillBranchID != userBranchID,
			DiscountID:       discID,
			DiscountName:     discName,
			DiscountPerPiece: discPerPiece,
		})
	}

	subtotal := 0.0
	for _, li := range lineItems {
		subtotal += li.Total
	}
	subtotal = math.Round(subtotal*100) / 100

	couponDiscountAmount := 0.0
	var validatedCoupon *domain.PosCouponInfo
	if strings.TrimSpace(input.CouponCode) != "" {
		coupon, err := r.EvaluateCoupon(ctx, input.CouponCode, subtotal)
		if err != nil {
			return nil, err
		}
		validatedCoupon = coupon
		couponDiscountAmount = coupon.DiscountAmount
	}

	priceAfterCoupon := math.Max(0, subtotal-couponDiscountAmount)
	afterBaht := math.Max(0, priceAfterCoupon-input.SpecialDiscountBaht)
	discountPercentAmount := afterBaht * (input.SpecialDiscountPercent / 100.0)
	totalSpecialDiscount := input.SpecialDiscountBaht + discountPercentAmount

	totalDiscount := math.Round((couponDiscountAmount+totalSpecialDiscount)*100) / 100
	finalTotalAmount := math.Max(0, math.Round(afterBaht-discountPercentAmount))
	vatAmount := math.Round((finalTotalAmount-(finalTotalAmount/1.07))*100) / 100

	orderCode := fmt.Sprintf("INV%d", time.Now().UnixNano()/int64(time.Millisecond))
	saleMode := "TAKE_AWAY"
	if strings.EqualFold(input.SaleMode, "DELIVERY") {
		saleMode = "DELIVERY"
	}
	paymentMethod := "CASH"
	if input.PaymentMethod != "" {
		paymentMethod = input.PaymentMethod
	}

	// Discount snapshot JSON
	snapshot := map[string]interface{}{
		"special_discount": map[string]interface{}{
			"percent": input.SpecialDiscountPercent,
			"baht":    input.SpecialDiscountBaht,
		},
		"sale_mode":      saleMode,
		"payment_method": paymentMethod,
	}
	if validatedCoupon != nil {
		snapshot["coupon"] = map[string]interface{}{
			"id":              validatedCoupon.ID,
			"code":            validatedCoupon.Code,
			"title":           validatedCoupon.Title,
			"discount_amount": couponDiscountAmount,
		}
	}
	snapshotJSON, _ := json.Marshal(snapshot)

	// Insert order
	var orderID int64
	insertOrderQuery := `
		INSERT INTO orders (
			order_code, user_id, branch_id, subtotal, discount_amount, total_amount, vat_amount,
			status, device_type, discount_snapshot, shipping_name, shipping_phone, shipping_address,
			company_name_th, tax_id, special_discount_percent, special_discount_baht, payment_method, created_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			'PENDING', 'MOBILE_POS', $8, $9, $10, $11,
			$12, $13, $14, $15, $16, NOW()
		) RETURNING id
	`

	var shippingName, shippingPhone, shippingAddress, compName, taxID *string
	if input.CustomerName != "" {
		s := strings.TrimSpace(input.CustomerName)
		shippingName = &s
	}
	if input.CustomerPhone != "" {
		s := strings.TrimSpace(input.CustomerPhone)
		shippingPhone = &s
	}
	if input.CustomerAddress != "" {
		s := strings.TrimSpace(input.CustomerAddress)
		shippingAddress = &s
	}
	if input.CompanyName != "" {
		s := strings.TrimSpace(input.CompanyName)
		compName = &s
	}
	if input.TaxID != "" {
		s := strings.TrimSpace(input.TaxID)
		taxID = &s
	}

	err = tx.QueryRowContext(ctx, insertOrderQuery,
		orderCode, userID, userBranchID, subtotal, totalDiscount, finalTotalAmount, vatAmount,
		string(snapshotJSON), shippingName, shippingPhone, shippingAddress,
		compName, taxID, input.SpecialDiscountPercent, input.SpecialDiscountBaht, paymentMethod,
	).Scan(&orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert order: %w", err)
	}

	// Insert order items
	insertItemQuery := `
		INSERT INTO order_items (
			order_id, product_id, qty, price_at_sale, total_item_amount, fulfill_branch_id,
			discount_id, discount_name, discount_amount_per_piece, item_status
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING_SHIPMENT'
		)
	`
	for _, li := range lineItems {
		_, err := tx.ExecContext(ctx, insertItemQuery,
			orderID, li.ProductID, li.Quantity, li.Price, li.Total, li.FulfillBranchID,
			li.DiscountID, li.DiscountName, li.DiscountPerPiece,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to insert order item: %w", err)
		}
	}

	// Remote transfer tickets for cross-branch fulfillments
	remoteGroups := make(map[int][]LineItem)
	for _, li := range lineItems {
		if li.FulfillBranchID != userBranchID {
			remoteGroups[li.FulfillBranchID] = append(remoteGroups[li.FulfillBranchID], li)
		}
	}

	for remoteBranchID, rItems := range remoteGroups {
		tfCode := fmt.Sprintf("DP-AUTO-%d-%d", time.Now().UnixNano()/int64(time.Millisecond), remoteBranchID)
		note := fmt.Sprintf("[ใบเบิกแพ็คอัตโนมัติจากใบขาย Mobile POS %s] \nผู้รับ: %s \nโทร: %s",
			orderCode, input.CustomerName, input.CustomerPhone)

		var tfID int64
		err := tx.QueryRowContext(ctx, `
			INSERT INTO stock_transfers (transfer_code, from_branch_id, to_branch_id, status, note, created_by, created_at)
			VALUES ($1, $2, $3, 'AWAITING_SHIPMENT', $4, $5, NOW())
			RETURNING id
		`, tfCode, remoteBranchID, userBranchID, note, userID).Scan(&tfID)
		if err == nil && tfID > 0 {
			for _, ritm := range rItems {
				_, _ = tx.ExecContext(ctx, `
					INSERT INTO stock_transfer_items (transfer_id, product_id, qty, transfer_qty, item_status)
					VALUES ($1, $2, $3, $4, 'AWAITING_SHIPMENT')
				`, tfID, ritm.ProductID, ritm.Quantity, ritm.Quantity)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit checkout: %w", err)
	}

	return &domain.CheckoutResult{
		Success:        true,
		OrderCode:      orderCode,
		OrderID:        orderID,
		Subtotal:       subtotal,
		DiscountAmount: totalDiscount,
		TotalAmount:    finalTotalAmount,
		VatAmount:      vatAmount,
		Status:         "PENDING",
		SaleMode:       saleMode,
		PaymentMethod:  paymentMethod,
	}, nil
}

// CreateQuote creates a formal quotation with QT... code
func (r *PosRepo) CreateQuote(ctx context.Context, userID uuid.UUID, userBranchID int, input domain.QuoteInput) (*domain.QuoteResult, error) {
	if len(input.Items) == 0 {
		return nil, fmt.Errorf("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ")
	}

	productQuantities := make(map[int64]int)
	var productIDs []int64
	for _, itm := range input.Items {
		if itm.ProductID <= 0 || itm.Quantity <= 0 {
			return nil, fmt.Errorf("รายการสินค้าไม่ถูกต้อง")
		}
		if _, exists := productQuantities[itm.ProductID]; !exists {
			productIDs = append(productIDs, itm.ProductID)
		}
		productQuantities[itm.ProductID] += itm.Quantity
	}

	type ProdRow struct {
		ID    int64           `db:"id"`
		Name  string          `db:"name"`
		Price sql.NullFloat64 `db:"price"`
	}
	var prods []ProdRow
	query, args, err := sqlx.In(`SELECT id, name, price FROM products WHERE id IN (?)`, productIDs)
	if err != nil {
		return nil, err
	}
	query = r.db.Rebind(query)
	if err := r.db.SelectContext(ctx, &prods, query, args...); err != nil {
		return nil, fmt.Errorf("failed to fetch products: %w", err)
	}
	if len(prods) != len(productIDs) {
		return nil, fmt.Errorf("พบสินค้าที่ไม่สามารถเสนอราคาได้")
	}

	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	subtotal := 0.0
	type QuoteLine struct {
		ProductID int64
		Qty       int
		Price     float64
		Total     float64
	}
	var lines []QuoteLine

	for _, p := range prods {
		qty := productQuantities[p.ID]
		// Check stock in user's branch
		var available sql.NullFloat64
		_ = tx.GetContext(ctx, &available, `SELECT qty FROM stock WHERE product_id = $1 AND branch_id = $2`, p.ID, userBranchID)
		availQty := 0
		if available.Valid {
			availQty = int(available.Float64)
		}
		if availQty < qty {
			return nil, fmt.Errorf("สินค้า %s มีสต็อกไม่เพียงพอ", p.Name)
		}

		price := 0.0
		if p.Price.Valid {
			price = p.Price.Float64
		}
		if price <= 0 {
			return nil, fmt.Errorf("สินค้า %s ยังไม่ได้ตั้งราคา", p.Name)
		}
		tot := price * float64(qty)
		subtotal += tot
		lines = append(lines, QuoteLine{ProductID: p.ID, Qty: qty, Price: price, Total: tot})
	}

	orderCode := fmt.Sprintf("QT-%d", time.Now().UnixNano()/int64(time.Millisecond))
	var orderID int64

	var shippingName, shippingPhone, shippingAddress, compName, taxID *string
	if input.CustomerName != "" {
		s := strings.TrimSpace(input.CustomerName)
		shippingName = &s
	}
	if input.CustomerPhone != "" {
		s := strings.TrimSpace(input.CustomerPhone)
		shippingPhone = &s
	}
	if input.CustomerAddress != "" {
		s := strings.TrimSpace(input.CustomerAddress)
		shippingAddress = &s
	}
	if input.CompanyName != "" {
		s := strings.TrimSpace(input.CompanyName)
		compName = &s
	}
	if input.TaxID != "" {
		s := strings.TrimSpace(input.TaxID)
		taxID = &s
	}

	insertOrderQuery := `
		INSERT INTO orders (
			order_code, user_id, branch_id, subtotal, discount_amount, total_amount,
			status, device_type, shipping_name, shipping_phone, shipping_address,
			company_name_th, tax_id, created_at
		) VALUES (
			$1, $2, $3, $4, 0, $5,
			'PENDING', 'MOBILE_POS', $6, $7, $8,
			$9, $10, NOW()
		) RETURNING id
	`
	err = tx.QueryRowContext(ctx, insertOrderQuery,
		orderCode, userID, userBranchID, subtotal, subtotal,
		shippingName, shippingPhone, shippingAddress, compName, taxID,
	).Scan(&orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to insert quote order: %w", err)
	}

	for _, l := range lines {
		_, err := tx.ExecContext(ctx, `
			INSERT INTO order_items (order_id, product_id, qty, price_at_sale, total_item_amount, fulfill_branch_id, item_status)
			VALUES ($1, $2, $3, $4, $5, $6, 'PENDING_SHIPMENT')
		`, orderID, l.ProductID, l.Qty, l.Price, l.Total, userBranchID)
		if err != nil {
			return nil, fmt.Errorf("failed to insert quote item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return &domain.QuoteResult{
		Success:   true,
		OrderCode: orderCode,
		Status:    "PENDING",
	}, nil
}

// GetDispatches returns dispatches grouped for the mobile UI
func (r *PosRepo) GetDispatches(ctx context.Context, myBranchID int, userID uuid.UUID) (*domain.GroupedDispatchesData, error) {
	branches, _ := r.GetBranches(ctx)
	branchMap := make(map[int]string)
	for _, b := range branches {
		branchMap[b.ID] = b.Name
	}

	// Check if order_hidden_by_users exists
	hiddenSet := make(map[int64]bool)
	var hasHiddenTable bool
	_ = r.db.GetContext(ctx, &hasHiddenTable, `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_hidden_by_users')`)
	if hasHiddenTable {
		var hiddenIDs []int64
		_ = r.db.SelectContext(ctx, &hiddenIDs, `SELECT order_id FROM order_hidden_by_users WHERE user_id = $1`, userID)
		for _, hid := range hiddenIDs {
			hiddenSet[hid] = true
		}
	}

	// Helper to load orders with items
	fetchOrders := func(whereClause string, limit int, args ...interface{}) ([]domain.DispatchOrderInfo, error) {
		type OrderRaw struct {
			ID              int64           `db:"id"`
			OrderCode       string          `db:"order_code"`
			CreatedAt       time.Time       `db:"created_at"`
			ShippingName    sql.NullString  `db:"shipping_name"`
			ShippingPhone   sql.NullString  `db:"shipping_phone"`
			ShippingAddress sql.NullString  `db:"shipping_address"`
			Latitude        sql.NullFloat64 `db:"latitude"`
			Longitude       sql.NullFloat64 `db:"longitude"`
			Status          string          `db:"status"`
			TotalAmount     sql.NullFloat64 `db:"total_amount"`
			DiscountAmount  sql.NullFloat64 `db:"discount_amount"`
			BranchID        int             `db:"branch_id"`
		}

		limitClause := ""
		if limit > 0 {
			limitClause = fmt.Sprintf("LIMIT %d", limit)
		}

		q := fmt.Sprintf(`
			SELECT DISTINCT o.id, o.order_code, o.created_at, o.shipping_name, o.shipping_phone,
			       o.shipping_address, o.latitude, o.longitude, o.status, o.total_amount,
			       o.discount_amount, o.branch_id
			FROM orders o
			LEFT JOIN order_items oi ON oi.order_id = o.id
			WHERE %s
			ORDER BY o.created_at DESC
			%s
		`, whereClause, limitClause)

		var rawOrders []OrderRaw
		if err := r.db.SelectContext(ctx, &rawOrders, q, args...); err != nil {
			return nil, err
		}

		if len(rawOrders) == 0 {
			return []domain.DispatchOrderInfo{}, nil
		}

		var orderIDs []int64
		orderFilter := make(map[int64]OrderRaw)
		for _, o := range rawOrders {
			if !hiddenSet[o.ID] {
				orderIDs = append(orderIDs, o.ID)
				orderFilter[o.ID] = o
			}
		}

		if len(orderIDs) == 0 {
			return []domain.DispatchOrderInfo{}, nil
		}

		// Fetch items for these orders
		type ItemRaw struct {
			ID              int64           `db:"id"`
			OrderID         int64           `db:"order_id"`
			ProductID       int64           `db:"product_id"`
			Qty             int             `db:"qty"`
			ItemStatus      string          `db:"item_status"`
			PriceAtSale     sql.NullFloat64 `db:"price_at_sale"`
			FulfillBranchID int             `db:"fulfill_branch_id"`
			ProductName     string          `db:"product_name"`
			ProductSku      sql.NullString  `db:"product_sku"`
			ProductImageURL sql.NullString  `db:"product_image_url"`
			ProductPrice    sql.NullFloat64 `db:"product_price"`
			Specs           []byte          `db:"specs"`
			WidthCm         sql.NullFloat64 `db:"width_cm"`
			LengthCm        sql.NullFloat64 `db:"length_cm"`
			ThicknessCm     sql.NullFloat64 `db:"thickness_cm"`
			ProductSup      sql.NullString  `db:"product_sup"`
		}

		itemQuery, itemArgs, err := sqlx.In(`
			SELECT oi.id, oi.order_id, oi.product_id, oi.qty, oi.item_status, oi.price_at_sale, oi.fulfill_branch_id,
			       p.name as product_name, p.sku as product_sku, p.image_url as product_image_url, p.price as product_price,
			       p.specs, p.width_cm, p.length_cm, p.thickness_cm, cg.product_sup
			FROM order_items oi
			JOIN products p ON p.id = oi.product_id
			LEFT JOIN collection_groups cg ON cg.id = p.collection_group_id
			WHERE oi.order_id IN (?)
		`, orderIDs)
		if err != nil {
			return nil, err
		}
		itemQuery = r.db.Rebind(itemQuery)

		var rawItems []ItemRaw
		_ = r.db.SelectContext(ctx, &rawItems, itemQuery, itemArgs...)

		// Fetch stocks for the items in their fulfill branches
		itemStocks := make(map[string]int)
		if len(rawItems) > 0 {
			type Stk struct {
				ProductID int64           `db:"product_id"`
				BranchID  int             `db:"branch_id"`
				Qty       sql.NullFloat64 `db:"qty"`
			}
			var stks []Stk
			pIDs := make([]int64, len(rawItems))
			for i, it := range rawItems {
				pIDs[i] = it.ProductID
			}
			sQuery, sArgs, _ := sqlx.In(`SELECT product_id, branch_id, qty FROM stock WHERE product_id IN (?)`, pIDs)
			sQuery = r.db.Rebind(sQuery)
			_ = r.db.SelectContext(ctx, &stks, sQuery, sArgs...)
			for _, s := range stks {
				k := fmt.Sprintf("%d_%d", s.ProductID, s.BranchID)
				if s.Qty.Valid {
					itemStocks[k] = int(s.Qty.Float64)
				}
			}
		}

		itemsByOrder := make(map[int64][]domain.DispatchOrderItemInfo)
		for _, item := range rawItems {
			stkKey := fmt.Sprintf("%d_%d", item.ProductID, item.FulfillBranchID)
			avail := itemStocks[stkKey]

			bName := branchMap[item.FulfillBranchID]
			if bName == "" {
				bName = "สาขา"
			}

			priceAtSale := 0.0
			if item.PriceAtSale.Valid {
				priceAtSale = item.PriceAtSale.Float64
			}
			prodPrice := 0.0
			if item.ProductPrice.Valid {
				prodPrice = item.ProductPrice.Float64
			}

			var imgPtr *string
			if item.ProductImageURL.Valid && item.ProductImageURL.String != "" {
				s := item.ProductImageURL.String
				imgPtr = &s
			}

			var supPtr *string
			if item.ProductSup.Valid && item.ProductSup.String != "" {
				s := item.ProductSup.String
				supPtr = &s
			}

			var materialPtr *string
			if len(item.Specs) > 0 {
				var specsMap map[string]interface{}
				if err := json.Unmarshal(item.Specs, &specsMap); err == nil {
					if mat, ok := specsMap["material"].(string); ok && mat != "" {
						materialPtr = &mat
					}
					if supPtr == nil {
						if rawSub, ok := specsMap["product_sup"].(string); ok && rawSub != "" {
							supPtr = &rawSub
						}
					}
				}
			}

			var sizeStr *string
			w := ""
			if item.WidthCm.Valid {
				w = fmt.Sprintf("%.0f", item.WidthCm.Float64)
			}
			d := ""
			if item.LengthCm.Valid {
				d = fmt.Sprintf("%.0f", item.LengthCm.Float64)
			}
			h := ""
			if item.ThicknessCm.Valid {
				h = fmt.Sprintf("%.0f", item.ThicknessCm.Float64)
			}
			if w != "" || d != "" || h != "" {
				s := fmt.Sprintf("W%s x D%s x H%s cm", valOrDash(w), valOrDash(d), valOrDash(h))
				sizeStr = &s
			}

			itemsByOrder[item.OrderID] = append(itemsByOrder[item.OrderID], domain.DispatchOrderItemInfo{
				ID:                item.ID,
				Qty:               item.Qty,
				ItemStatus:        item.ItemStatus,
				PriceAtSale:       priceAtSale,
				FulfillBranchID:   item.FulfillBranchID,
				FulfillBranchName: bName,
				IsCrossBranch:     item.FulfillBranchID != myBranchID,
				AvailableStock:    avail,
				Product: domain.DispatchProductInfo{
					ID:         item.ProductID,
					Name:       item.ProductName,
					Sku:        item.ProductSku.String,
					ImageURL:   imgPtr,
					Price:      prodPrice,
					ProductSup: supPtr,
					Material:   materialPtr,
					SizeStr:    sizeStr,
				},
			})
		}

		var result []domain.DispatchOrderInfo
		for _, o := range rawOrders {
			if hiddenSet[o.ID] {
				continue
			}
			shippingAddr := o.ShippingAddress.String
			isTakeaway := strings.HasPrefix(shippingAddr, "[รับหน้าร้าน]") ||
				(shippingAddr == "" && !o.Latitude.Valid && !o.Longitude.Valid)

			var latPtr, lonPtr *float64
			if o.Latitude.Valid {
				lat := o.Latitude.Float64
				latPtr = &lat
			}
			if o.Longitude.Valid {
				lon := o.Longitude.Float64
				lonPtr = &lon
			}

			totalAmount := 0.0
			if o.TotalAmount.Valid {
				totalAmount = o.TotalAmount.Float64
			}
			discountAmount := 0.0
			if o.DiscountAmount.Valid {
				discountAmount = o.DiscountAmount.Float64
			}

			items := itemsByOrder[o.ID]
			if items == nil {
				items = []domain.DispatchOrderItemInfo{}
			}

			result = append(result, domain.DispatchOrderInfo{
				ID:              o.ID,
				OrderCode:       o.OrderCode,
				CreatedAt:       o.CreatedAt.Format(time.RFC3339),
				ShippingName:    o.ShippingName.String,
				ShippingPhone:   o.ShippingPhone.String,
				ShippingAddress: shippingAddr,
				Latitude:        latPtr,
				Longitude:       lonPtr,
				Status:          o.Status,
				TotalAmount:     totalAmount,
				DiscountAmount:  discountAmount,
				IsTakeaway:      isTakeaway,
				Items:           items,
			})
		}
		return result, nil
	}

	// 1. My tasks (fulfill_branch_id = myBranchID)
	myTasksRaw, err := fetchOrders(`oi.fulfill_branch_id = $1 AND oi.item_status IN ('PENDING_SHIPMENT', 'SHIPPED')`, 0, myBranchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch my tasks: %w", err)
	}

	// 2. Follow-up tasks (branch_id = myBranchID but fulfill_branch_id != myBranchID)
	followUpTasksRaw, err := fetchOrders(`o.branch_id = $1 AND oi.fulfill_branch_id != $1 AND oi.item_status IN ('PENDING_SHIPMENT', 'SHIPPED')`, 0, myBranchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch follow up tasks: %w", err)
	}

	// 3. Completed tasks
	completedTasks, err := fetchOrders(`o.branch_id = $1 AND o.status = 'COMPLETED'`, 50, myBranchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch completed tasks: %w", err)
	}

	// 4. Cancelled tasks
	cancelledTasks, err := fetchOrders(`o.branch_id = $1 AND o.status = 'CANCELLED'`, 50, myBranchID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch cancelled tasks: %w", err)
	}

	// Combine myTasks and followUps into overview
	combinedMap := make(map[int64]domain.DispatchOrderInfo)
	for _, t := range append(myTasksRaw, followUpTasksRaw...) {
		if existing, ok := combinedMap[t.ID]; ok {
			existingItemIDs := make(map[int64]bool)
			for _, it := range existing.Items {
				existingItemIDs[it.ID] = true
			}
			for _, it := range t.Items {
				if !existingItemIDs[it.ID] {
					existing.Items = append(existing.Items, it)
				}
			}
			combinedMap[t.ID] = existing
		} else {
			combinedMap[t.ID] = t
		}
	}

	var overviewTasks []domain.DispatchOrderInfo
	for _, o := range combinedMap {
		overviewTasks = append(overviewTasks, o)
	}
	sort.Slice(overviewTasks, func(i, j int) bool {
		return overviewTasks[i].CreatedAt > overviewTasks[j].CreatedAt
	})

	var pendingApprovalTasks, filteredMyTasks, filteredFollowUps []domain.DispatchOrderInfo
	for _, t := range overviewTasks {
		if t.Status == "PENDING" {
			pendingApprovalTasks = append(pendingApprovalTasks, t)
		}
	}
	for _, t := range myTasksRaw {
		if t.Status != "PENDING" {
			filteredMyTasks = append(filteredMyTasks, t)
		}
	}
	for _, t := range followUpTasksRaw {
		if t.Status != "PENDING" {
			filteredFollowUps = append(filteredFollowUps, t)
		}
	}

	return &domain.GroupedDispatchesData{
		OverviewTasks:        overviewTasks,
		MyTasks:              filteredMyTasks,
		FollowUpTasks:        filteredFollowUps,
		CompletedTasks:       completedTasks,
		CancelledTasks:       cancelledTasks,
		PendingApprovalTasks: pendingApprovalTasks,
		Counts: domain.DispatchCountsInfo{
			Overview:        len(overviewTasks),
			MyTasks:         len(filteredMyTasks),
			FollowUps:       len(filteredFollowUps),
			Completed:       len(completedTasks),
			Cancelled:       len(cancelledTasks),
			PendingApproval: len(pendingApprovalTasks),
		},
	}, nil
}

// ApproveAndCutStock confirms payment, cuts inventory stock, writes stock movement, and marks takeaway complete or processing
func (r *PosRepo) ApproveAndCutStock(ctx context.Context, orderID int64, customOrderCode string, userID uuid.UUID) (string, error) {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	type OrderRow struct {
		ID               int64          `db:"id"`
		OrderCode        string         `db:"order_code"`
		Status           string         `db:"status"`
		ShippingAddress  sql.NullString `db:"shipping_address"`
		DiscountSnapshot []byte         `db:"discount_snapshot"`
	}
	var order OrderRow
	err = tx.GetContext(ctx, &order, `SELECT id, order_code, status, shipping_address, discount_snapshot FROM orders WHERE id = $1`, orderID)
	if err != nil {
		return "", fmt.Errorf("ไม่พบคำสั่งซื้อนี้ในระบบ")
	}
	if order.Status != "PENDING" {
		return "", fmt.Errorf("ออเดอร์นี้ถูกอนุมัติไปแล้ว ไม่สามารถตัดสต็อกซ้ำได้")
	}

	finalOrderCode := order.OrderCode
	if strings.TrimSpace(customOrderCode) != "" {
		finalOrderCode = strings.ToUpper(strings.TrimSpace(customOrderCode))
		_, err := tx.ExecContext(ctx, `UPDATE orders SET order_code = $1 WHERE id = $2`, finalOrderCode, orderID)
		if err != nil {
			if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
				return "", fmt.Errorf("รหัสออเดอร์นี้มีอยู่ในระบบแล้ว กรุณาใช้รหัสอื่น")
			}
			return "", err
		}
		_, _ = tx.ExecContext(ctx, `UPDATE stock_transfers SET note = note || ' [อัปเดต ' || $1 || ']' WHERE note LIKE '%' || $2 || '%'`, finalOrderCode, order.OrderCode)
	}

	// Fetch items
	type ItemStockCut struct {
		ProductID       int64  `db:"product_id"`
		ProductName     string `db:"product_name"`
		FulfillBranchID int    `db:"fulfill_branch_id"`
		Qty             int    `db:"qty"`
	}
	var items []ItemStockCut
	err = tx.SelectContext(ctx, &items, `
		SELECT oi.product_id, p.name as product_name, oi.fulfill_branch_id, oi.qty
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		WHERE oi.order_id = $1
	`, orderID)
	if err != nil {
		return "", err
	}

	// Deduct stock for each item
	for _, itm := range items {
		if itm.Qty <= 0 {
			continue
		}
		var stockID int64
		var currentQty float64
		err := tx.QueryRowContext(ctx, `
			SELECT id, qty FROM stock WHERE product_id = $1 AND branch_id = $2 FOR UPDATE
		`, itm.ProductID, itm.FulfillBranchID).Scan(&stockID, &currentQty)

		if err != nil {
			var isCustom bool
			_ = tx.GetContext(ctx, &isCustom, `SELECT COALESCE((specs->>'is_custom')::boolean, false) FROM products WHERE id = $1`, itm.ProductID)
			if isCustom {
				_ = tx.QueryRowContext(ctx, `
					INSERT INTO stock (product_id, branch_id, qty) VALUES ($1, $2, 999)
					ON CONFLICT (product_id, branch_id) DO UPDATE SET qty = 999
					RETURNING id, qty
				`, itm.ProductID, itm.FulfillBranchID).Scan(&stockID, &currentQty)
				err = nil
			}
		}

		if err != nil || currentQty < float64(itm.Qty) {
			return "", fmt.Errorf("สต็อกสินค้า \"%s\" ไม่เพียงพอในสาขานี้", itm.ProductName)
		}

		_, err = tx.ExecContext(ctx, `
			UPDATE stock SET qty = qty - $1, updated_at = NOW() WHERE id = $2
		`, itm.Qty, stockID)
		if err != nil {
			return "", fmt.Errorf("ตัดสต็อกสินค้า %s ล้มเหลว: %w", itm.ProductName, err)
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO stock_movements (
				product_id_bigint, branch_id, type, qty, note, ref_type, ref_id_bigint, created_by, created_at_ts
			) VALUES (
				$1, $2, 'SALE', $3, $4, 'ORDER', $5, $6, NOW()
			)
		`, itm.ProductID, itm.FulfillBranchID, -itm.Qty,
			fmt.Sprintf("ชำระเงินและอนุมัติใบขาย (บิล: %s) โดย Mobile POS", finalOrderCode),
			orderID, userID,
		)
		if err != nil {
			return "", fmt.Errorf("บันทึกการเคลื่อนไหวสต็อกล้มเหลว: %w", err)
		}
	}

	isTakeaway := strings.HasPrefix(order.ShippingAddress.String, "[รับหน้าร้าน]")
	if isTakeaway {
		_, _ = tx.ExecContext(ctx, `UPDATE orders SET status = 'COMPLETED' WHERE id = $1`, orderID)
		_, _ = tx.ExecContext(ctx, `UPDATE order_items SET item_status = 'DELIVERED' WHERE order_id = $1`, orderID)
	} else {
		_, _ = tx.ExecContext(ctx, `UPDATE orders SET status = 'PROCESSING' WHERE id = $1`, orderID)
	}

	// Increment coupon usage if promo used
	if len(order.DiscountSnapshot) > 0 {
		var snapshot map[string]interface{}
		if err := json.Unmarshal(order.DiscountSnapshot, &snapshot); err == nil {
			if cp, ok := snapshot["coupon"].(map[string]interface{}); ok {
				if cpID, ok := cp["id"].(string); ok && cpID != "" {
					_, _ = tx.ExecContext(ctx, `
						UPDATE terra_collection_promotions SET used_count = used_count + 1, updated_at = NOW() WHERE id = $1
					`, cpID)
				}
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}

	return finalOrderCode, nil
}

// MarkShipped updates order_items status to DELIVERED and marks stock transfers completed
func (r *PosRepo) MarkShipped(ctx context.Context, orderID int64, itemIDs []int64) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var orderCode string
	err = tx.GetContext(ctx, &orderCode, `SELECT order_code FROM orders WHERE id = $1`, orderID)
	if err != nil {
		return fmt.Errorf("ไม่พบคำสั่งซื้อนี้ในระบบ")
	}

	if len(itemIDs) > 0 {
		q, args, err := sqlx.In(`UPDATE order_items SET item_status = 'DELIVERED' WHERE id IN (?) AND order_id = ?`, itemIDs, orderID)
		if err != nil {
			return err
		}
		q = tx.Rebind(q)
		_, err = tx.ExecContext(ctx, q, args...)
		if err != nil {
			return err
		}
	} else {
		_, err := tx.ExecContext(ctx, `UPDATE order_items SET item_status = 'DELIVERED' WHERE order_id = $1`, orderID)
		if err != nil {
			return err
		}
	}

	_, _ = tx.ExecContext(ctx, `
		UPDATE stock_transfers SET status = 'COMPLETED', shipped_at = NOW()
		WHERE note LIKE '%' || $1 || '%' AND status = 'AWAITING_SHIPMENT'
	`, orderCode)

	var remainingCount int
	_ = tx.GetContext(ctx, &remainingCount, `
		SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND item_status IN ('PENDING_SHIPMENT', 'SHIPPED')
	`, orderID)

	if remainingCount == 0 {
		_, _ = tx.ExecContext(ctx, `UPDATE orders SET status = 'COMPLETED' WHERE id = $1`, orderID)
	}

	return tx.Commit()
}

// CancelOrder restores stock and cancels order, items, and transfers
func (r *PosRepo) CancelOrder(ctx context.Context, orderID int64, reason string, userID uuid.UUID) error {
	tx, err := r.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	type OrderRow struct {
		ID               int64  `db:"id"`
		OrderCode        string `db:"order_code"`
		Status           string `db:"status"`
		DiscountSnapshot []byte `db:"discount_snapshot"`
	}
	var order OrderRow
	err = tx.GetContext(ctx, &order, `SELECT id, order_code, status, discount_snapshot FROM orders WHERE id = $1`, orderID)
	if err != nil {
		return fmt.Errorf("ไม่พบคำสั่งซื้อนี้")
	}

	// Restore stock if previously approved/processed
	if order.Status != "PENDING" {
		type Itm struct {
			ProductID       int64 `db:"product_id"`
			FulfillBranchID int   `db:"fulfill_branch_id"`
			Qty             int   `db:"qty"`
		}
		var itms []Itm
		_ = tx.SelectContext(ctx, &itms, `SELECT product_id, fulfill_branch_id, qty FROM order_items WHERE order_id = $1`, orderID)

		for _, it := range itms {
			if it.Qty <= 0 {
				continue
			}
			_, _ = tx.ExecContext(ctx, `
				UPDATE stock SET qty = qty + $1, updated_at = NOW() WHERE product_id = $2 AND branch_id = $3
			`, it.Qty, it.ProductID, it.FulfillBranchID)

			note := fmt.Sprintf("คืนสต็อกเนื่องจากยกเลิกบิล Mobile POS (บิล: %s)", order.OrderCode)
			if strings.TrimSpace(reason) != "" {
				note += fmt.Sprintf(" - สาเหตุ: %s", strings.TrimSpace(reason))
			}
			_, _ = tx.ExecContext(ctx, `
				INSERT INTO stock_movements (product_id_bigint, branch_id, type, qty, note, ref_type, ref_id_bigint, created_by, created_at_ts)
				VALUES ($1, $2, 'ADJUSTMENT', $3, $4, 'ORDER', $5, $6, NOW())
			`, it.ProductID, it.FulfillBranchID, it.Qty, note, orderID, userID)
		}

		if len(order.DiscountSnapshot) > 0 {
			var snapshot map[string]interface{}
			if err := json.Unmarshal(order.DiscountSnapshot, &snapshot); err == nil {
				if cp, ok := snapshot["coupon"].(map[string]interface{}); ok {
					if cpID, ok := cp["id"].(string); ok && cpID != "" {
						_, _ = tx.ExecContext(ctx, `
							UPDATE terra_collection_promotions SET used_count = GREATEST(0, used_count - 1), updated_at = NOW() WHERE id = $1
						`, cpID)
					}
				}
			}
		}
	}

	var snapMap map[string]interface{}
	if len(order.DiscountSnapshot) > 0 {
		_ = json.Unmarshal(order.DiscountSnapshot, &snapMap)
	} else {
		snapMap = make(map[string]interface{})
	}
	snapMap["cancel_reason"] = strings.TrimSpace(reason)
	snapMap["cancelled_at"] = time.Now().Format(time.RFC3339)
	snapMap["cancelled_by_id"] = userID.String()
	newSnapJSON, _ := json.Marshal(snapMap)

	_, err = tx.ExecContext(ctx, `UPDATE orders SET status = 'CANCELLED', discount_snapshot = $1 WHERE id = $2`, string(newSnapJSON), orderID)
	if err != nil {
		return err
	}

	_, _ = tx.ExecContext(ctx, `UPDATE order_items SET item_status = 'CANCELLED' WHERE order_id = $1`, orderID)
	_, _ = tx.ExecContext(ctx, `
		UPDATE stock_transfers SET status = 'CANCELLED'
		WHERE note LIKE '%' || $1 || '%' AND status IN ('PENDING', 'AWAITING_SHIPMENT')
	`, order.OrderCode)

	return tx.Commit()
}

// UpdateCustomer updates customer delivery and shipping details
func (r *PosRepo) UpdateCustomer(ctx context.Context, input domain.UpdateCustomerInput) error {
	sets := []string{}
	args := []interface{}{}
	argIdx := 1

	if input.ShippingName != nil {
		sets = append(sets, fmt.Sprintf("shipping_name = $%d", argIdx))
		args = append(args, strings.TrimSpace(*input.ShippingName))
		argIdx++
	}
	if input.ShippingPhone != nil {
		sets = append(sets, fmt.Sprintf("shipping_phone = $%d", argIdx))
		args = append(args, strings.TrimSpace(*input.ShippingPhone))
		argIdx++
	}
	if input.ShippingAddress != nil {
		sets = append(sets, fmt.Sprintf("shipping_address = $%d", argIdx))
		args = append(args, strings.TrimSpace(*input.ShippingAddress))
		argIdx++
	}
	if input.Latitude != nil {
		sets = append(sets, fmt.Sprintf("latitude = $%d", argIdx))
		args = append(args, *input.Latitude)
		argIdx++
	}
	if input.Longitude != nil {
		sets = append(sets, fmt.Sprintf("longitude = $%d", argIdx))
		args = append(args, *input.Longitude)
		argIdx++
	}

	if len(sets) == 0 {
		return nil
	}

	query := fmt.Sprintf("UPDATE orders SET %s WHERE id = $%d", strings.Join(sets, ", "), argIdx)
	args = append(args, input.OrderID)

	_, err := r.db.ExecContext(ctx, query, args...)
	return err
}

func valOrDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}
