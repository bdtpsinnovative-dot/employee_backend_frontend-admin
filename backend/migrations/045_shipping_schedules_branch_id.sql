-- 045_shipping_schedules_branch_id.sql
-- Link shipping_schedules to public.branches (id bigserial)

ALTER TABLE public.shipping_schedules
    ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shipping_schedules_branch_id
    ON public.shipping_schedules (branch_id);
