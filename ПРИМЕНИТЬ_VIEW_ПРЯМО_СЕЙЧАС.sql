-- =====================================================
-- ⚡ СРОЧНОЕ ПРИМЕНЕНИЕ VIEW ozon_performance_summary ⚡
-- =====================================================
-- Этот скрипт создает VIEW для автоматической загрузки данных в "Аналитика Продвижения"
--
-- КАК ПРИМЕНИТЬ:
-- 1. Откройте Supabase SQL Editor:
--    https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
-- 2. Скопируйте весь этот файл целиком
-- 3. Вставьте в SQL Editor
-- 4. Нажмите RUN (▶️) или Ctrl+Enter
-- 5. Дождитесь сообщения "Success"
-- 6. Обновите страницу приложения (F5)
-- =====================================================

-- ШАГ 1: Удаляем старый VIEW если существует
-- =====================================================
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

-- ШАГ 2: Создаем новый VIEW с автоматическим суммированием
-- =====================================================
CREATE OR REPLACE VIEW public.ozon_performance_summary AS
SELECT
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,

  -- ИСХОДНЫЕ ДАННЫЕ (как есть из таблицы)
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

  -- ✨ АВТОМАТИЧЕСКОЕ СУММИРОВАНИЕ ✨
  -- Эти поля будут автоматически рассчитываться
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,

  -- Пересчитанные метрики с учетом total_orders и total_revenue
  CASE
    WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2)
    ELSE 0
  END AS ctr,

  CASE
    WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2)
    ELSE 0
  END AS cpc,

  CASE
    WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2)
    ELSE 0
  END AS conversion,

  CASE
    WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2)
    ELSE NULL
  END AS drr,

  CASE
    WHEN money_spent > 0 AND (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) - money_spent) / money_spent) * 100, 2)
    ELSE NULL
  END AS roi,

  CASE
    WHEN (COALESCE(orders, 0) + COALESCE(orders_model, 0)) > 0
    THEN ROUND((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) / (COALESCE(orders, 0) + COALESCE(orders_model, 0)), 2)
    ELSE NULL
  END AS avg_order_value,

  -- Метаданные
  imported_at,
  import_batch_id

FROM public.ozon_performance_daily;

-- ШАГ 3: Даем права доступа
-- =====================================================
-- ВАЖНО: Нужно дать права и для authenticated, и для anon!
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO anon;

-- ШАГ 4: Создаем комментарии для документации
-- =====================================================
COMMENT ON VIEW public.ozon_performance_summary IS
'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model.
Используйте этот VIEW вместо прямого запроса к ozon_performance_daily для получения итоговых метрик.';

COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS
'Автоматическая сумма: orders + orders_model';

COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS
'Автоматическая сумма: revenue + revenue_model';

-- ШАГ 5: Проверка что VIEW создан и работает
-- =====================================================
SELECT
  '✅ VIEW успешно создан!' as result,
  COUNT(*) as total_records,
  COUNT(DISTINCT marketplace_id) as unique_marketplaces,
  COUNT(DISTINCT campaign_id) as unique_campaigns,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date
FROM ozon_performance_summary;

-- =====================================================
-- ✅ ГОТОВО!
-- =====================================================
-- После выполнения этого скрипта:
-- 1. Обновите страницу приложения (F5)
-- 2. Откройте "Аналитика Продвижения"
-- 3. Данные должны загрузиться!
--
-- Если данных все равно нет:
-- - Проверьте что total_records выше > 0 (в результате запроса выше)
-- - Если total_records = 0, значит нет данных в таблице ozon_performance_daily
-- - Запустите синхронизацию OZON Performance в приложении
-- =====================================================
