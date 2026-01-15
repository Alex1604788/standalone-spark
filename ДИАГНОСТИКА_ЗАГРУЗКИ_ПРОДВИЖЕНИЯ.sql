-- =====================================================
-- КОМПЛЕКСНАЯ ДИАГНОСТИКА: Почему не загружаются данные в "Аналитика Продвижения"
-- =====================================================
-- Используйте этот скрипт в Supabase SQL Editor для полной диагностики проблемы
-- https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- =====================================================

-- ШАГ 1: Проверяем существование VIEW
-- =====================================================
SELECT
  'Проверка существования VIEW' as step,
  COUNT(*) as view_exists
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_summary';
-- ✅ Должно вернуть 1, если VIEW существует
-- ❌ Если вернуло 0 - VIEW НЕ СОЗДАН! Нужно применить миграцию

-- ШАГ 2: Проверяем существование базовой таблицы
-- =====================================================
SELECT
  'Проверка существования таблицы ozon_performance_daily' as step,
  COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_daily';
-- ✅ Должно вернуть 1

-- ШАГ 3: Проверяем количество записей в базовой таблице
-- =====================================================
SELECT
  'Количество записей в ozon_performance_daily' as step,
  COUNT(*) as total_records,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date
FROM ozon_performance_daily;
-- Если total_records = 0, то нет данных! Нужно запустить синхронизацию

-- ШАГ 4: Проверяем marketplace_id текущего пользователя
-- =====================================================
-- Замените YOUR_USER_ID на UUID вашего пользователя из auth.users
-- Или запустите этот запрос из авторизованной сессии
SELECT
  'Marketplace текущего пользователя' as step,
  m.id as marketplace_id,
  m.name as marketplace_name,
  m.user_id,
  COUNT(opd.id) as records_in_ozon_performance_daily
FROM marketplaces m
LEFT JOIN ozon_performance_daily opd ON opd.marketplace_id = m.id
WHERE m.user_id = auth.uid() -- Используем текущего пользователя
GROUP BY m.id, m.name, m.user_id;
-- Если records_in_ozon_performance_daily = 0, то нет данных для этого marketplace

-- ШАГ 5: Проверяем доступ к VIEW (если он существует)
-- =====================================================
-- Этот запрос вернет ошибку, если VIEW не существует
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'ozon_performance_summary') THEN
    RAISE NOTICE '✅ VIEW ozon_performance_summary существует';

    -- Проверяем количество записей в VIEW
    PERFORM COUNT(*) FROM ozon_performance_summary;
    RAISE NOTICE '✅ VIEW доступен для чтения';
  ELSE
    RAISE WARNING '❌ VIEW ozon_performance_summary НЕ СУЩЕСТВУЕТ! Необходимо применить миграцию!';
  END IF;
END $$;

-- ШАГ 6: Проверяем права доступа к VIEW (если он существует)
-- =====================================================
SELECT
  'Права доступа к VIEW' as step,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'ozon_performance_summary';
-- Должно показать права для authenticated и anon

-- ШАГ 7: Проверяем политики RLS для базовой таблицы
-- =====================================================
SELECT
  'Политики RLS для ozon_performance_daily' as step,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'ozon_performance_daily';

-- =====================================================
-- ИТОГОВАЯ ДИАГНОСТИКА
-- =====================================================
-- После выполнения всех шагов выше, вы узнаете:
-- 1. Существует ли VIEW ozon_performance_summary (Шаг 1)
-- 2. Есть ли данные в базовой таблице (Шаг 3)
-- 3. Есть ли данные для вашего marketplace (Шаг 4)
-- 4. Есть ли права доступа к VIEW (Шаг 6)
--
-- ВОЗМОЖНЫЕ ПРИЧИНЫ ПРОБЛЕМЫ:
--
-- ❌ Если VIEW не существует (Шаг 1 вернул 0):
--    РЕШЕНИЕ: Примените миграцию (см. ниже раздел "ПРИМЕНЕНИЕ VIEW")
--
-- ❌ Если данных нет в таблице (Шаг 3 вернул total_records = 0):
--    РЕШЕНИЕ: Запустите синхронизацию OZON Performance в приложении
--
-- ❌ Если данных нет для вашего marketplace (Шаг 4 вернул records = 0):
--    РЕШЕНИЕ: Проверьте настройки API OZON и запустите синхронизацию
--
-- =====================================================
-- ПРИМЕНЕНИЕ VIEW (если он не существует)
-- =====================================================
-- Если VIEW не существует, скопируйте и выполните код ниже:

/*
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

CREATE VIEW public.ozon_performance_summary AS
SELECT
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,
  money_spent,
  views,
  clicks,
  orders,
  orders_model,
  revenue,
  revenue_model,
  add_to_cart,
  add_to_cart_conversion,
  favorites,
  avg_bill,

  -- Автоматическое суммирование
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,

  -- Рассчитанные метрики
  CASE WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2) ELSE 0 END AS cpc,
  CASE WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2) ELSE 0 END AS conversion,
  CASE
    WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2)
    ELSE NULL
  END AS drr,

  imported_at,
  import_batch_id
FROM public.ozon_performance_daily;

-- Даем права доступа
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO anon;

-- Проверяем что VIEW создан и работает
SELECT
  'VIEW успешно создан!' as result,
  COUNT(*) as total_records
FROM ozon_performance_summary;
*/
