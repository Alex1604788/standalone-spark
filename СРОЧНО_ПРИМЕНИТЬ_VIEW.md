# 🚨 СРОЧНО: Применить VIEW для исправления "Нет данных"

## Проблема
На странице "Аналитика Продвижения" показывается "Нет данных за выбранный период" потому что **VIEW `ozon_performance_summary` НЕ ПРИМЕНЕН** к базе данных Supabase.

## ⚡ РЕШЕНИЕ (2 минуты)

### Вариант 1: Через Supabase Dashboard (САМЫЙ ПРОСТОЙ)

1. **Откройте Supabase SQL Editor:**
   ```
   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new
   ```

2. **Скопируйте весь SQL ниже и вставьте в редактор:**

```sql
-- =====================================================
-- БЕЗОПАСНОЕ СОЗДАНИЕ VIEW ozon_performance_summary
-- =====================================================

-- Удаляем старый VIEW если существует
DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE;

-- Создаем новый VIEW с автоматическим суммированием
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

  -- ИСХОДНЫЕ ДАННЫЕ
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

  -- Рассчитанные метрики
  CASE WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2) ELSE 0 END AS cpc,
  CASE WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2) ELSE 0 END AS conversion,
  CASE WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0 THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2) ELSE NULL END AS drr,
  CASE WHEN money_spent > 0 AND (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0 THEN ROUND((((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) - money_spent) / money_spent) * 100, 2) ELSE NULL END AS roi,
  CASE WHEN (COALESCE(orders, 0) + COALESCE(orders_model, 0)) > 0 THEN ROUND((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) / (COALESCE(orders, 0) + COALESCE(orders_model, 0)), 2) ELSE NULL END AS avg_order_value,

  -- Метаданные
  imported_at,
  import_batch_id

FROM public.ozon_performance_daily;

-- Даем права доступа
GRANT SELECT ON public.ozon_performance_summary TO authenticated;
GRANT SELECT ON public.ozon_performance_summary TO service_role;
GRANT SELECT ON public.ozon_performance_summary TO anon;

-- Проверяем что VIEW создан и работает
SELECT COUNT(*) as total_records FROM public.ozon_performance_summary;
```

3. **Нажмите кнопку "RUN" (▶️)** или `Ctrl+Enter`

4. **Проверьте результат:**
   - Внизу должно появиться "Success"
   - Последний запрос покажет количество записей (например, `total_records: 1234`)

### Вариант 2: Через готовый файл

Если хотите использовать готовый файл:

```bash
# В терминале проекта
cat fix-view-safe.sql
# Скопируйте вывод и вставьте в Supabase SQL Editor
```

## ✅ После применения

1. **Обновите страницу приложения** (F5)
2. **Откройте раздел "Аналитика → Продвижения"**
3. **Данные должны загрузиться!**

Если данных всё равно нет:
- Проверьте период в фильтрах (попробуйте "последние 180 дней")
- Убедитесь что синхронизация OZON Performance была запущена

## 🔍 Диагностика

Если VIEW применен, но данных всё равно нет, выполните в SQL Editor:

```sql
-- Проверка 1: Есть ли данные в базовой таблице?
SELECT COUNT(*) as total FROM ozon_performance_daily;

-- Проверка 2: За какие даты есть данные?
SELECT MIN(stat_date) as first_date, MAX(stat_date) as last_date, COUNT(*) as total
FROM ozon_performance_daily;

-- Проверка 3: Для каких marketplace_id есть данные?
SELECT marketplace_id, COUNT(*) as records
FROM ozon_performance_daily
GROUP BY marketplace_id;

-- Проверка 4: Ваш marketplace_id
SELECT id, name, platform FROM marketplaces;
```

## 📋 Что делает этот VIEW?

- **Автоматически суммирует** `orders + orders_model` → `total_orders`
- **Автоматически суммирует** `revenue + revenue_model` → `total_revenue`
- **Рассчитывает метрики**: CTR, CPC, конверсия, ДРР, ROI
- **Используется** страницей `src/pages/analytics/PromotionAnalytics.tsx` для загрузки данных

---

**⚡ ДЕЙСТВУЙТЕ ПРЯМО СЕЙЧАС! Это займет 2 минуты и решит проблему. ⚡**
