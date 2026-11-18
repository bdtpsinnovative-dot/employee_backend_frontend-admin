-- 044_shipping_schedules.sql
-- Delivery / Shipping Calendar table for taskmanagementsystem (employee)
-- Accessible (read & write) by all active authenticated users in public.users

CREATE TABLE IF NOT EXISTS public.shipping_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_date DATE NOT NULL,
    time_slot TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    map_url TEXT NOT NULL DEFAULT '',
    order_no TEXT NOT NULL DEFAULT '',
    vehicle_type TEXT NOT NULL DEFAULT 'company_truck'
        CHECK (vehicle_type IN ('company_truck', 'lalamove', 'external_courier', 'customer_pickup', 'other')),
    driver_name TEXT NOT NULL DEFAULT '',
    assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_transit', 'delivered', 'postponed', 'cancelled')),
    notes TEXT NOT NULL DEFAULT '',
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_schedules_delivery_date
    ON public.shipping_schedules (delivery_date);

CREATE INDEX IF NOT EXISTS idx_shipping_schedules_brand_id
    ON public.shipping_schedules (brand_id);

CREATE INDEX IF NOT EXISTS idx_shipping_schedules_status
    ON public.shipping_schedules (status);

CREATE OR REPLACE FUNCTION public.set_shipping_schedules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shipping_schedules_updated_at ON public.shipping_schedules;
CREATE TRIGGER trg_shipping_schedules_updated_at
    BEFORE UPDATE ON public.shipping_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.set_shipping_schedules_updated_at();

ALTER TABLE public.shipping_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_authenticated_active_users_manage_shipping_schedules" ON public.shipping_schedules;
CREATE POLICY "allow_authenticated_active_users_manage_shipping_schedules"
    ON public.shipping_schedules
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE users.auth_id = (SELECT auth.uid())
              AND users.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE users.auth_id = (SELECT auth.uid())
              AND users.status = 'active'
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_schedules TO authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'shipping_schedules'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shipping_schedules;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;
