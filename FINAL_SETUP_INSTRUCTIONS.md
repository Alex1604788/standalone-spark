# 🎯 ФИНАЛЬНЫЕ ИНСТРУКЦИИ ПО НАСТРОЙКЕ

## ✅ ЧТО УЖЕ СДЕЛАНО:

### 1. Обновлен фронтенд (✅ Закоммичено и запушено)
- `src/pages/analytics/PromotionAnalytics.tsx` - обновлен для использования VIEW
- `src/pages/analytics/PromotionsAnalytics.tsx` - обновлен для использования VIEW
- `src/integrations/supabase/types.ts` - добавлены типы для VIEW

### 2. Создана миграция VIEW
- `supabase/migrations/20260112000000_create_ozon_performance_summary_view.sql`
- `VIEW_TO_APPLY.sql` - готовый SQL для применения

### 3. Протестирована Edge Function
- ✅ `/functions/v1/sync-ozon-performance` работает и готова к использованию

---

## 🔧 ЧТО НУЖНО СДЕЛАТЬ:

### Шаг 1: Применить SQL VIEW (КРИТИЧНО!)

VIEW нужно создать вручную через Supabase Dashboard, так как прямой доступ к SQL через API ограничен.

**ИНСТРУКЦИЯ:**

1. Откройте Supabase SQL Editor:
   👉 https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new

2. Скопируйте содержимое файла **`VIEW_TO_APPLY.sql`** (он находится в корне проекта)

3. Вставьте в SQL Editor

4. Нажмите **"Run"** или **Ctrl+Enter**

5. Должно появиться сообщение: ✅ "Success. No rows returned"

---

### Шаг 2: Проверить что VIEW создался

Выполните в SQL Editor:

```sql
-- Проверить что VIEW существует
SELECT table_name
FROM information_schema.views
WHERE table_name = 'ozon_performance_summary';

-- Должен вернуть: ozon_performance_summary

-- Посмотреть данные
SELECT
  stat_date,
  orders,
  orders_model,
  total_orders,        -- Должна быть сумма orders + orders_model
  revenue,
  revenue_model,
  total_revenue        -- Должна быть сумма revenue + revenue_model
FROM ozon_performance_summary
LIMIT 5;
```

---

### Шаг 3: Запустить синхронизацию OZON

После создания VIEW запустите синхронизацию:

```bash
# Из корня проекта
curl -X POST "https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon-performance" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk" \
  -H "Content-Type: application/json" \
  -d '{"marketplace_id": "YOUR_MARKETPLACE_ID", "days": 7}'
```

**Где взять marketplace_id:**
```sql
SELECT id, name FROM marketplaces;
```

---

### Шаг 4: Проверить работу фронтенда

1. Откройте приложение
2. Перейдите в раздел "Аналитика Продвижения"
3. Должны отобразиться данные с автоматически рассчитанными total_orders и total_revenue

---

## 📊 СОДЕРЖИМОЕ VIEW_TO_APPLY.sql:

```sql
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
  avg_bill,
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,
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
  imported_at,
  import_batch_id
FROM public.ozon_performance_daily;

GRANT SELECT ON public.ozon_performance_summary TO authenticated;

COMMENT ON VIEW public.ozon_performance_summary IS 'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model. Используйте этот VIEW вместо прямого запроса к ozon_performance_daily для получения итоговых метрик.';

COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS 'Автоматическая сумма: orders + orders_model';

COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS 'Автоматическая сумма: revenue + revenue_model';
```

---

## 🎉 ПОСЛЕ ПРИМЕНЕНИЯ:

1. ✅ VIEW создан и работает
2. ✅ Фронтенд автоматически использует VIEW
3. ✅ Все суммы orders + orders_model и revenue + revenue_model рассчитываются автоматически
4. ✅ Не нужно вручную суммировать данные в каждом запросе

---

## 🔍 ПРОВЕРКА РАБОТЫ:

```sql
-- Получить данные за последние 7 дней
SELECT
  stat_date,
  campaign_name,
  SUM(total_orders) as total_orders,
  SUM(total_revenue) as total_revenue,
  SUM(money_spent) as money_spent
FROM ozon_performance_summary
WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stat_date, campaign_name
ORDER BY stat_date DESC;
```

---

## 📝 КОММИТЫ:

- `8db2d9d` - feat: Обновить фронтенд для использования ozon_performance_summary VIEW

Ветка: `claude/auto-deploy-and-model-orders-hN0XE`

---

## 💡 ВАЖНО:

**VIEW должен быть применен ДО** запуска синхронизации, иначе фронтенд не сможет получить данные!

После применения VIEW все будет работать автоматически. 🚀
