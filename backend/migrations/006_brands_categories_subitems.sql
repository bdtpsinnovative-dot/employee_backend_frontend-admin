-- Migration 006: เพิ่ม brands, task_categories, task_sub_items tables
-- และเพิ่ม brand_id, category_id ใน tasks table

-- ─────────────────────── brands ───────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────── task_categories ──────────────────────
CREATE TABLE IF NOT EXISTS task_categories (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────── เพิ่ม columns ใน tasks ───────────────
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS brand_id    UUID REFERENCES brands(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES task_categories(id) ON DELETE SET NULL;

-- ─────────────────────── task_sub_items ───────────────────────
CREATE TABLE IF NOT EXISTS task_sub_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    is_done    BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_sub_items_task_id ON task_sub_items(task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_brand_id ON tasks(brand_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id);
