-- 036_contact_inquiries_trigger.sql
-- Automatically notifies admins when an inquiry is submitted from any website

CREATE OR REPLACE FUNCTION public.handle_new_contact_inquiry_notification()
RETURNS TRIGGER AS $$
DECLARE
    admin_rec RECORD;
    brand_name TEXT;
BEGIN
    brand_name := CASE 
        WHEN NEW.source = 'terrahome' THEN 'TERRA HOME'
        WHEN NEW.source = 'nexteak' THEN 'NEXTEAK'
        WHEN NEW.source = 'furniture' THEN 'FURNITURE'
        WHEN NEW.source = 'wallcraft' THEN 'WALLCRAFT'
        ELSE 'ZENSLAB'
    END;

    FOR admin_rec IN SELECT id FROM public.users WHERE role = 'admin' AND status = 'active' LOOP
        INSERT INTO public.notifications (user_id, title, body, type, is_read, created_at)
        VALUES (
            admin_rec.id,
            '📩 มีลูกค้าติดต่อใหม่จากเว็บ ' || brand_name,
            'คุณ ' || NEW.first_name || ' ' || NEW.last_name || ' (' || COALESCE(NULLIF(NEW.phone, ''), NEW.email) || '): ' || LEFT(COALESCE(NULLIF(NEW.message, ''), 'ติดต่อจากหน้าเว็บ'), 80),
            'inquiry',
            false,
            NOW()
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_contact_inquiry_created ON public.contact_inquiries;
CREATE TRIGGER on_contact_inquiry_created
AFTER INSERT ON public.contact_inquiries
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_contact_inquiry_notification();
