-- =====================================================
-- БЕЗОПАСНОЕ ПЕРЕСОЗДАНИЕ VIEW ozon_performance_summary
-- =====================================================
-- Этот скрипт безопасно пересоздает VIEW даже если он уже существует
-- =====================================================

-- ШАГ 1: Удаляем VIEW со всеми зависимостями
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

-- ШАГ 2: Создаем VIEW заново
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

  -- ИСХОДНЫЕ ДАННЫЕ (как есть из таблицы)
  money_spent,
  views,
  clicks,
  orders,
  orders_model,
  revenue,
  revenue_model,
  add_to_cart,
  avg_bill,

  -- ✨ АВТОМАТИЧЕСКОЕ СУММИРОВАНИЕ ✨
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,

  -- Пересчитанные метрики
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
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO service_role;

-- ШАГ 4: Добавляем комментарии
COMMENT ON VIEW public.ozon_performance_summary IS
'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model.';

COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS
'Автоматическая сумма: orders + orders_model';

COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS
'Автоматическая сумма: revenue + revenue_model';

-- ШАГ 5: Проверяем что VIEW создан
SELECT
  schemaname,
  viewname,
  viewowner
FROM pg_views
WHERE viewname = 'ozon_performance_summary';
