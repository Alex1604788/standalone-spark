-- Увеличиваем statement_timeout для больших batch insert операций
-- По умолчанию Supabase использует 60 секунд, увеличиваем до 5 минут

-- Для текущей сессии (будет применяться при каждом подключении)
ALTER DATABASE postgres SET statement_timeout = '300s';

-- Комментарий
COMMENT ON DATABASE postgres IS 'Увеличен statement_timeout до 5 минут для поддержки больших batch операций при синхронизации OZON Performance API';
