-- Migration 038: Add sender_id column to chat_messages referencing users(id)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages(sender_id);
