-- Проверка структуры таблицы ozon_performance_daily
-- Выполните в Supabase SQL Editor

SELECT
  column_name,
  data_type,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_daily'
ORDER BY ordinal_position;
