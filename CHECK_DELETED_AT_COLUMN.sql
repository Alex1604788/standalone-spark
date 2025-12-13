-- Проверка наличия колонки deleted_at в базе данных
-- Скопируйте и выполните в Supabase SQL Editor:
-- https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/sql/new

SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('reviews', 'questions', 'replies')
  AND column_name = 'deleted_at'
ORDER BY table_name;

-- Если запрос вернёт 3 строки (reviews, questions, replies) - миграция УЖЕ ПРИМЕНЕНА
-- Если запрос вернёт 0 строк - миграция НЕ ПРИМЕНЕНА, но функция работает со старой версией
