-- 037_omnichannel_chat.sql
-- Unified Chat tables for Facebook Messenger & LINE OA
-- Enables omnichannel customer chat directly inside employee frontend-admin

-- 1. Conversation Table (1 room per customer per platform)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL CHECK (platform IN ('line', 'facebook')),
    platform_user_id TEXT NOT NULL,
    customer_name TEXT NOT NULL DEFAULT 'ลูกค้า',
    customer_avatar TEXT DEFAULT '',
    last_message TEXT DEFAULT '',
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unread_count INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_platform_user UNIQUE (platform, platform_user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_platform ON public.chat_conversations(platform);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_msg_at ON public.chat_conversations(last_message_at DESC);

-- 2. Messages Table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'agent', 'bot')),
    sender_name TEXT DEFAULT '',
    sender_avatar TEXT DEFAULT '',
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'file')),
    content TEXT NOT NULL DEFAULT '',
    media_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_id ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at ASC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated employees and admins to view and manage conversations
DROP POLICY IF EXISTS "allow_auth_all_conversations" ON public.chat_conversations;
CREATE POLICY "allow_auth_all_conversations" 
ON public.chat_conversations 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Allow authenticated employees to view and insert messages
DROP POLICY IF EXISTS "allow_auth_all_messages" ON public.chat_messages;
CREATE POLICY "allow_auth_all_messages" 
ON public.chat_messages 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Allow anon / service_role (e.g. n8n webhooks) to insert/update conversations and messages
DROP POLICY IF EXISTS "allow_anon_sync_conversations" ON public.chat_conversations;
CREATE POLICY "allow_anon_sync_conversations" 
ON public.chat_conversations 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "allow_anon_sync_messages" ON public.chat_messages;
CREATE POLICY "allow_anon_sync_messages" 
ON public.chat_messages 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

GRANT ALL ON public.chat_conversations TO authenticated, anon;
GRANT ALL ON public.chat_messages TO authenticated, anon;

-- 4. Enable Supabase Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
