-- Persist the manual order of brands used by the responsibility matrix.
ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS next_order
    FROM brands
)
UPDATE brands b
SET sort_order = ranked.next_order
FROM ranked
WHERE b.id = ranked.id
  AND b.sort_order = 0;

CREATE INDEX IF NOT EXISTS idx_brands_sort_order ON brands(sort_order, name);
