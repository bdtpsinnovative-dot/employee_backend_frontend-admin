-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    brand_id UUID REFERENCES public.brands(id),
    owner_id UUID REFERENCES public.users(id),
    start_date TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'active',
    progress NUMERIC(5,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project members table
CREATE TABLE IF NOT EXISTS public.project_members (
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);

-- Create project groups table
CREATE TABLE IF NOT EXISTS public.project_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Modify tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.project_groups(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS record_kind VARCHAR(50) DEFAULT 'legacy_assignment';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'medium';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
-- Note: completed_at is already added by 016_task_submissions.sql

-- Data Migration: 
-- 1. Create a Project for each legacy Task (where record_kind = 'legacy_assignment' which is default)
-- (We'll do this carefully. Since 'legacy_assignment' is default, all current tasks are legacy)
INSERT INTO public.projects (id, name, description, brand_id, owner_id, due_date, status, created_at)
SELECT id, title, description, brand_id, assigned_by, due_date, status, created_at
FROM public.tasks
ON CONFLICT DO NOTHING;

-- 2. Create Project Members from legacy Task Assignees
INSERT INTO public.project_members (project_id, user_id)
SELECT task_id, user_id
FROM public.task_assignees
ON CONFLICT DO NOTHING;

-- 3. Create Project Groups from Task Lists
INSERT INTO public.project_groups (id, project_id, name, description, sort_order, created_at)
SELECT id, task_id, name, description, sort_order, created_at
FROM public.task_lists
ON CONFLICT DO NOTHING;

-- 4. Convert Task Cards to Tasks
-- Since we are keeping tasks table for both legacy and new tasks, we'll insert new rows for cards.
-- A Task created from a card will have record_kind = 'task'
INSERT INTO public.tasks (id, project_id, group_id, title, description, status, sort_order, start_date, due_date, priority, record_kind, created_at)
SELECT id, 
       (SELECT task_id FROM public.task_lists WHERE id = list_id), -- project_id (legacy task_id)
       list_id, -- group_id (legacy list_id)
       title, 
       description, 
       status, 
       sort_order, 
       start_date, 
       due_date, 
       priority, 
       'task', -- record_kind
       created_at
FROM public.task_cards
ON CONFLICT DO NOTHING;

-- 5. Map task_sub_items from legacy tasks to new tasks
UPDATE public.task_sub_items
SET task_id = card_id
WHERE card_id IS NOT NULL;

-- Note: We might need to handle assignees for the new tasks.
INSERT INTO public.task_assignees (task_id, user_id, assigned_at)
SELECT tc.id, ta.user_id, NOW()
FROM public.task_cards tc
JOIN public.task_lists tl ON tc.list_id = tl.id
JOIN public.task_assignees ta ON tl.task_id = ta.task_id
ON CONFLICT DO NOTHING;

-- 6. Attachments mapping
ALTER TABLE public.card_attachments RENAME TO task_attachments;
ALTER TABLE public.task_attachments RENAME COLUMN card_id TO task_id;

-- task submissions and events reference legacy task ID (which is now Project ID).
-- We'll add project_id to point to the project correctly.
ALTER TABLE public.task_submissions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id);
UPDATE public.task_submissions SET project_id = task_id;

ALTER TABLE public.task_events ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id);
UPDATE public.task_events SET project_id = task_id;
