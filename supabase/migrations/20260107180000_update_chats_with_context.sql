-- Add order and product context to chats table
ALTER TABLE public.chats
  ADD COLUMN IF NOT EXISTS order_number TEXT,
  ADD COLUMN IF NOT EXISTS product_sku TEXT;

-- Add image support to chat_messages table
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_image BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS image_urls TEXT[],
  ADD COLUMN IF NOT EXISTS moderate_status TEXT CHECK (moderate_status IN ('SUCCESS', 'PENDING', 'FAILED', NULL));

-- Add index for faster lookups by order_number and SKU
CREATE INDEX IF NOT EXISTS idx_chats_order_number ON public.chats(order_number) WHERE order_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chats_product_sku ON public.chats(product_sku) WHERE product_sku IS NOT NULL;

-- Comment on new fields
COMMENT ON COLUMN public.chats.order_number IS 'OZON order number from chat context';
COMMENT ON COLUMN public.chats.product_sku IS 'Product SKU from chat context';
COMMENT ON COLUMN public.chat_messages.is_image IS 'Whether message contains images';
COMMENT ON COLUMN public.chat_messages.image_urls IS 'Array of image URLs from message data field';
COMMENT ON COLUMN public.chat_messages.moderate_status IS 'Image moderation status from OZON';
