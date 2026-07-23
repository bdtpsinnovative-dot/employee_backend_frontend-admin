-- Reuse task_sub_items as the canonical subtask table so existing data remains
-- available. Add only the fields required by the new mobile Subtask model.
ALTER TABLE public.task_sub_items
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.subtask_check_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subtask_id UUID NOT NULL REFERENCES public.task_sub_items(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_sub_items_task_sort
    ON public.task_sub_items(task_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_subtask_check_items_subtask_sort
    ON public.subtask_check_items(subtask_id, sort_order, created_at);

-- The Go API connects using its server-side database role. Keep the new table
-- unavailable to direct anon/authenticated Data API access unless explicit
-- ownership policies are added later.
ALTER TABLE public.subtask_check_items ENABLE ROW LEVEL SECURITY;
