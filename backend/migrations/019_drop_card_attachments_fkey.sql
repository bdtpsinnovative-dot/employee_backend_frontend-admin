-- Drop the foreign key from card_attachments since we are using task_sub_items as cards now
ALTER TABLE public.card_attachments DROP CONSTRAINT IF EXISTS card_attachments_card_id_fkey;
