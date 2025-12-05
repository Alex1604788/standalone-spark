-- Add sync logging fields to marketplaces table
ALTER TABLE public.marketplaces
ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sync_status TEXT,
ADD COLUMN IF NOT EXISTS last_sync_error TEXT;