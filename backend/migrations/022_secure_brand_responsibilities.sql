-- This table is managed only through the authenticated Go admin API.
ALTER TABLE public.brand_responsibilities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE public.brand_responsibilities FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE public.brand_responsibilities FROM authenticated;
    END IF;
END
$$;
