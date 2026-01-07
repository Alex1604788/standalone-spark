-- =====================================================
-- OZON Chats Integration - Create Tables
-- Date: 2026-01-07
-- =====================================================

-- Create chats table
CREATE TABLE IF NOT EXISTS public.chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,

  -- Идентификаторы OZON
  chat_id TEXT NOT NULL,
  posting_number TEXT NOT NULL,

  -- Статус чата
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  unread_count INTEGER DEFAULT 0,

  -- Последнее сообщение (кэш для быстрого отображения)
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_from TEXT CHECK (last_message_from IN ('buyer', 'seller')),

  -- Метаданные
  expires_at TIMESTAMPTZ, -- когда истекает возможность отвечать (FBO: 48ч, FBS: 72ч)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(marketplace_id, chat_id)
);

-- Enable RLS
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,

  -- Данные сообщения из OZON
  message_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('buyer', 'seller')),
  sender_name TEXT,
  text TEXT NOT NULL,

  -- Статус прочтения
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(chat_id, message_id)
);

-- Enable RLS
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chats_marketplace ON public.chats(marketplace_id);
CREATE INDEX IF NOT EXISTS idx_chats_posting ON public.chats(marketplace_id, posting_number);
CREATE INDEX IF NOT EXISTS idx_chats_status_active ON public.chats(marketplace_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_chats_unread ON public.chats(marketplace_id, unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_chats_updated ON public.chats(marketplace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_time ON public.chat_messages(chat_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread ON public.chat_messages(chat_id) WHERE is_read = FALSE;

-- RLS Policies for chats
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chats' AND policyname = 'Users can view chats from own marketplaces'
  ) THEN
    CREATE POLICY "Users can view chats from own marketplaces"
      ON public.chats FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = chats.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chats' AND policyname = 'Users can manage chats from own marketplaces'
  ) THEN
    CREATE POLICY "Users can manage chats from own marketplaces"
      ON public.chats FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = chats.marketplace_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.marketplaces m
          WHERE m.id = chats.marketplace_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- RLS Policies for chat_messages
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can view messages from own chats'
  ) THEN
    CREATE POLICY "Users can view messages from own chats"
      ON public.chat_messages FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.chats c
          JOIN public.marketplaces m ON c.marketplace_id = m.id
          WHERE c.id = chat_messages.chat_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'chat_messages' AND policyname = 'Users can manage messages from own chats'
  ) THEN
    CREATE POLICY "Users can manage messages from own chats"
      ON public.chat_messages FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.chats c
          JOIN public.marketplaces m ON c.marketplace_id = m.id
          WHERE c.id = chat_messages.chat_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.chats c
          JOIN public.marketplaces m ON c.marketplace_id = m.id
          WHERE c.id = chat_messages.chat_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Update trigger for chats
DROP TRIGGER IF EXISTS update_chats_updated_at ON public.chats;
CREATE TRIGGER update_chats_updated_at
  BEFORE UPDATE ON public.chats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to update chat on new message
CREATE OR REPLACE FUNCTION public.update_chat_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chats
  SET
    last_message_text = NEW.text,
    last_message_at = NEW.sent_at,
    last_message_from = NEW.sender_type,
    updated_at = NOW(),
    unread_count = CASE
      WHEN NEW.sender_type = 'buyer' AND NEW.is_read = FALSE
      THEN unread_count + 1
      ELSE unread_count
    END
  WHERE id = NEW.chat_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update chat when message is inserted
DROP TRIGGER IF EXISTS trigger_update_chat_on_message ON public.chat_messages;
CREATE TRIGGER trigger_update_chat_on_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chat_on_message();

-- Function to decrease unread count when message is marked as read
CREATE OR REPLACE FUNCTION public.update_chat_on_read()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_read = FALSE AND NEW.is_read = TRUE AND NEW.sender_type = 'buyer' THEN
    UPDATE public.chats
    SET unread_count = GREATEST(0, unread_count - 1)
    WHERE id = NEW.chat_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update unread count when message is marked as read
DROP TRIGGER IF EXISTS trigger_update_chat_on_read ON public.chat_messages;
CREATE TRIGGER trigger_update_chat_on_read
  AFTER UPDATE ON public.chat_messages
  FOR EACH ROW
  WHEN (OLD.is_read IS DISTINCT FROM NEW.is_read)
  EXECUTE FUNCTION public.update_chat_on_read();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chats TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;

-- =====================================================
-- DONE! Chat tables created successfully
-- =====================================================
