-- =====================================================
-- СРОЧНАЯ ОЧИСТКА - ЗАПУСКАЙТЕ МНОГО РАЗ
-- =====================================================
-- Удаляет 500 записей за раз
-- Запускайте 100-200 раз пока не очистится
-- =====================================================

-- Удаляем 500 записей старше 7 дней
DELETE FROM public.audit_log
WHERE id IN (
  SELECT id
  FROM public.audit_log
  WHERE created_at < NOW() - INTERVAL '7 days'
  ORDER BY created_at ASC
  LIMIT 500
);

-- Показываем сколько осталось
SELECT
  COUNT(*) as records_left,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days') as old_records,
  pg_size_pretty(pg_total_relation_size('public.audit_log')) as size
FROM public.audit_log;
