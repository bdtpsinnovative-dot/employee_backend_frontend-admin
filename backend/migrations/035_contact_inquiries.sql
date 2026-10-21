-- 035_contact_inquiries.sql
-- Table for customer contact inquiries submitted from websites (e.g. ZENSLAB)
-- Restricted access: Only admins can view, update, and manage inquiries

CREATE TABLE IF NOT EXISTS public.contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT DEFAULT '',
    source TEXT NOT NULL DEFAULT 'zenslab_web',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'contacted', 'closed')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    admin_notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON public.contact_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at ON public.contact_inquiries(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

-- 1. Allow anyone (including unauthenticated website visitors) to submit an inquiry
DROP POLICY IF EXISTS "allow_public_insert_contact_inquiries" ON public.contact_inquiries;
CREATE POLICY "allow_public_insert_contact_inquiries" 
ON public.contact_inquiries 
FOR INSERT 
TO public, anon, authenticated 
WITH CHECK (true);

-- 2. Allow ONLY Admins to view, update status, and manage inquiries
DROP POLICY IF EXISTS "allow_admin_manage_contact_inquiries" ON public.contact_inquiries;
CREATE POLICY "allow_admin_manage_contact_inquiries" 
ON public.contact_inquiries 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.auth_id = auth.uid() 
        AND users.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.auth_id = auth.uid() 
        AND users.role = 'admin'
    )
);

-- Grant appropriate permissions to roles
GRANT INSERT ON public.contact_inquiries TO anon, authenticated;
GRANT ALL ON public.contact_inquiries TO authenticated;
