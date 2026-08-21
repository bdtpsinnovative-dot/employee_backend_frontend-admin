-- Pin the trigger function search path to prevent object-shadowing attacks.
ALTER FUNCTION public.soft_disable_work_location()
    SET search_path TO public, pg_temp;
