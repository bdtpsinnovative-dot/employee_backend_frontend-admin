ALTER TABLE public.tasks ALTER COLUMN assigned_to DROP NOT NULL;

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

UPDATE public.task_sub_items
SET task_id = card_id
WHERE card_id IS NOT NULL;

INSERT INTO public.task_assignees (task_id, user_id, created_at)
SELECT tc.id, ta.user_id, NOW()
FROM public.task_cards tc
JOIN public.task_lists tl ON tc.list_id = tl.id
JOIN public.task_assignees ta ON tl.task_id = ta.task_id
ON CONFLICT DO NOTHING;
