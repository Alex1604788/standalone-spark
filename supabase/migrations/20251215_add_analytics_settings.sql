-- Add analytics settings fields to user_settings table

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS weekly_negative_report_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_alerts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anomaly_threshold numeric(3,1) DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS weeks_for_norm integer DEFAULT 4;

-- Add comments for new fields
COMMENT ON COLUMN public.user_settings.weekly_negative_report_enabled IS 'Enable weekly negative reviews report via Telegram';
COMMENT ON COLUMN public.user_settings.anomaly_alerts_enabled IS 'Enable anomaly alerts for negative review growth via Telegram';
COMMENT ON COLUMN public.user_settings.anomaly_threshold IS 'Multiplier threshold for anomaly detection (e.g., 3.0 means 3x normal)';
COMMENT ON COLUMN public.user_settings.weeks_for_norm IS 'Number of weeks to calculate normal average for anomaly detection';

