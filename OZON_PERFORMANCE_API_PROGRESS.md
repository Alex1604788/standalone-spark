# OZON Performance API Integration - Progress Report

**Дата последнего обновления:** 2025-12-23
**Текущая версия Edge Function:** 2.6.3-header-based-parsing
**Статус:** Реализовано header-based парсинг, ожидается тестирование

---

## 📋 Краткое резюме

Интеграция с OZON Performance API для синхронизации данных о рекламных кампаниях. Основные проблемы решены:
1. ✅ ZIP архивы с CSV отчетами
2. ✅ Поддержка колонки `orders_model` (Заказы модели)
3. ✅ Header-based парсинг CSV для поддержки разных типов кампаний
4. ⏳ Требуется тестирование на реальных данных

---

## 🎯 Основные проблемы и решения

### Проблема 1: Excel Import - все суммы = 0.00
**Описание:** При импорте Excel файлов с начислениями OZON все значения `total_amount` и `amount_before_commission` = 0.00

**Причина:** Поиск колонки "Итого, руб." не работал, потому что в реальных файлах OZON используется символ ₽, а не слово "руб"

**Решение:**
- Файл: `src/pages/ImportData.tsx`
- Изменено: `findColumn(["итого, ₽", "итого руб", "итого,", "итого"])`
- Добавлен шаблон для скачивания с правильными названиями колонок
- Улучшен парсинг чисел: убираются пробелы, символы валюты, запятые заменяются на точки

### Проблема 2: Заказы модели не суммируются
**Описание:** В аналитике OZON показывает "Заказы" (71) + "Заказы модели" (8) = 79 заказов, но API возвращает их раздельно

**Решение:**
1. **Migration 1:** `20251222_add_orders_model_column.sql`
   - Добавлена колонка `orders_model INTEGER DEFAULT 0` в `ozon_performance_daily`

2. **Migration 2:** `20251222_update_promotion_costs_view_with_orders_model.sql`
   - Обновлен view `promotion_costs_aggregated`
   - Формула: `SUM(orders + COALESCE(orders_model, 0)) as total_orders`

3. **Edge Function:** `supabase/functions/sync-ozon-performance/index.ts`
   - Добавлен парсинг колонки `orders_model` из CSV
   - Сохранение в БД

### Проблема 3: CSV имеют разную структуру
**Описание:**
- Стандартные кампании: 16 колонок
- Бонусные кампании: 17 колонок (дополнительно "Расход за минусом бонусов")
- Position-based парсинг не работает для обоих типов

**Диагностические логи показали:**
```
🔍 Campaign "Джойка": CSV has 16 columns
🔍 Campaign "Блоки питания Лиза": CSV has 17 columns
```

**Решение (ТЕКУЩЕЕ):** Header-based парсинг
- Читаем заголовки CSV: `const headers = headerLine.split(';').map(h => h.trim().toLowerCase())`
- Создаем mapping колонок по названиям
- Используем точное совпадение для критических полей:
  - `findExactColumn('расход')` - не захватит "расход за минусом бонусов"
  - `findExactColumn('заказы')` - не захватит "заказы модели"
  - `findExactColumn('продажи')` - не захватит "продажи с моделей"

**Структура CSV:**

**Стандартные кампании (16 колонок):**
```
День;sku;Название;Цена;Показы;Клики;CTR;В корзину;CPC;Расход;Заказы;Продажи;Заказы модели;Продажи с моделей;ДРР;Дата
```

**Бонусные кампании (17 колонок):**
```
День;sku;Название;Цена;Показы;Клики;CTR;В корзину;CPC;Расход;Расход за минусом бонусов;Заказы;Продажи;Заказы модели;Продажи с моделей;ДРР;Дата
```

---

## 📁 Измененные файлы

### 1. `/home/user/standalone-spark/src/pages/ImportData.tsx`
**Версия:** Обновлен парсинг Excel

**Ключевые изменения:**
- Функция `parseAmount()` для парсинга чисел с символами валюты
- Поиск колонки "Итого, ₽" (с символом ₽)
- Функция `handleDownloadTemplate()` для скачивания шаблона с правильными колонками

**Код:**
```typescript
const parseAmount = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  str = str.replace(/[₽$€]/g, '');        // Убираем символы валюты
  str = str.replace(/\s/g, '');           // Убираем пробелы
  str = str.replace(',', '.');            // Запятая → точка
  return parseFloat(str) || 0;
};

const totalCol = findColumn(["итого, ₽", "итого руб", "итого,", "итого"]);
```

### 2. `/home/user/standalone-spark/supabase/functions/sync-ozon-performance/index.ts`
**Версия:** 2.6.3-header-based-parsing
**Дата:** 2025-12-22

**История версий:**
- 2.6.0-orders-model-support: Начальная поддержка orders_model
- 2.6.1-fix-csv-column-order: Исправлена позиция колонки (12→13)
- 2.6.2-debug-csv-structure: Добавлены диагностические логи
- 2.6.3-header-based-parsing: Header-based парсинг CSV

**Ключевые изменения:**

**Интерфейс (строка 55-67):**
```typescript
interface OzonPerformanceStats {
  date: string;
  sku: string;
  offer_id?: string;
  campaign_id: string;
  campaign_name?: string;
  campaign_type?: string;
  money_spent: number;
  views: number;
  clicks: number;
  orders: number;
  orders_model?: number;  // Заказы модели
  revenue?: number;
  add_to_cart?: number;
  avg_bill?: number;
}
```

**Header-based парсинг (строки 213-247):**
```typescript
// Парсим заголовки для динамического определения позиций столбцов
const headers = headerLine.split(';').map(h => h.trim().toLowerCase());

// Создаем mapping колонок
const findColumnIndex = (names: string[]): number => {
  for (const name of names) {
    const index = headers.findIndex(h => h.includes(name.toLowerCase()));
    if (index !== -1) return index;
  }
  return -1;
};

// Точное совпадение для критических полей
const findExactColumn = (name: string): number => {
  return headers.findIndex(h => h.trim() === name.toLowerCase());
};

const colIndexes = {
  date: findColumnIndex(['день', 'дата']),
  sku: findColumnIndex(['sku']),
  productName: findColumnIndex(['название']),
  price: findColumnIndex(['цена']),
  views: findColumnIndex(['показы']),
  clicks: findColumnIndex(['клики']),
  ctr: findColumnIndex(['ctr']),
  toCart: findColumnIndex(['в корзину', 'корзину']),
  avgCpc: findColumnIndex(['cpc', 'средняя стоимость клика']),
  spent: findExactColumn('расход'),  // Точное совпадение
  orders: findExactColumn('заказы'),  // Точное совпадение
  revenue: findExactColumn('продажи'),  // Точное совпадение
  ordersModel: findColumnIndex(['заказы модели', 'заказы мод']),
  revenueFromModels: findColumnIndex(['продажи с моделей', 'продажи с зак']),
};
```

**Извлечение данных (строки 244-256):**
```typescript
const getColumn = (index: number): string =>
  index >= 0 && index < columns.length ? columns[index] : '';

const dateStr = getColumn(colIndexes.date);
const sku = getColumn(colIndexes.sku);
const views = getColumn(colIndexes.views);
const clicks = getColumn(colIndexes.clicks);
const toCart = getColumn(colIndexes.toCart);
const avgCpc = getColumn(colIndexes.avgCpc);
const spent = getColumn(colIndexes.spent);
const orders = getColumn(colIndexes.orders);
const revenue = getColumn(colIndexes.revenue);
const ordersModel = getColumn(colIndexes.ordersModel);
const revenueFromModels = getColumn(colIndexes.revenueFromModels);
```

**Сохранение в БД (строки 617-629):**
```typescript
const records = allStats.map(stat => ({
  marketplace_id,
  stat_date: stat.date,
  sku: stat.sku,
  offer_id: stat.offer_id || null,
  campaign_id: stat.campaign_id,
  campaign_name: stat.campaign_name || null,
  campaign_type: stat.campaign_type || null,
  money_spent: stat.money_spent || 0,
  views: stat.views || 0,
  clicks: stat.clicks || 0,
  orders: stat.orders || 0,
  orders_model: stat.orders_model || 0,  // Заказы модели
  revenue: stat.revenue || null,
  add_to_cart: stat.add_to_cart || null,
  avg_bill: stat.avg_bill || null,
}));
```

### 3. `/home/user/standalone-spark/supabase/migrations/20251222_add_orders_model_column.sql`
**Создан:** 2025-12-22

```sql
-- Add orders_model column
ALTER TABLE public.ozon_performance_daily
ADD COLUMN IF NOT EXISTS orders_model INTEGER DEFAULT 0;

COMMENT ON COLUMN public.ozon_performance_daily.orders_model IS
'Заказы модели (model orders) - суммируется с orders в аналитике OZON';
```

### 4. `/home/user/standalone-spark/supabase/migrations/20251222_update_promotion_costs_view_with_orders_model.sql`
**Создан:** 2025-12-22

```sql
CREATE OR REPLACE VIEW public.promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders + COALESCE(orders_model, 0)) as total_orders,  -- Суммируем!
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;
```

---

## 🔍 Тестовые данные

### SKU для тестирования: 3107627916
**Период:** 17-18.12.2025

**Данные из OZON (скриншот пользователя):**
- Показы: 2818
- Клики: неизвестно
- Заказы: 71
- Заказы модели: 8
- **Итого заказов должно быть: 79**
- Выручка: 8850₽

**Кампании с orders_model > 0:**
```sql
SELECT campaign_id, campaign_name,
       SUM(orders) as total_orders,
       SUM(orders_model) as total_orders_model
FROM ozon_performance_daily
WHERE stat_date BETWEEN '2025-12-17' AND '2025-12-18'
  AND sku = '3107627916'
GROUP BY campaign_id, campaign_name;
```

**Ожидаемый результат:**
- Кампания "Джойка": orders_model > 0 ✅ (работает)
- Кампания "Блоки питания Лиза": orders_model > 0 ⏳ (требует проверки после деплоя)

---

## 🔗 Связанные компоненты

### Frontend Hook: `src/hooks/useSalesAnalytics.ts`
Использует SQL функцию `get_sales_analytics()` для получения агрегированных данных

**Ключевые запросы:**
1. `get_sales_analytics(marketplace_id, start_date, end_date)` - основные метрики
2. `product_business_data` - закупочная цена, категория, поставщик
3. `products` - название, артикул
4. `ozon_accruals` (тип "Оплата эквайринга") - стоимость эквайринга

### SQL Function: `get_sales_analytics`
**Файл:** `supabase/migrations/20251220_update_sales_analytics_for_performance_api.sql`

**Обновлено:** 2025-12-20 для использования `ozon_performance_daily` вместо старой таблицы `promotion_costs`

**Структура:**
```sql
CREATE OR REPLACE FUNCTION public.get_sales_analytics(
  p_marketplace_id UUID,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  offer_id TEXT,
  total_sales DECIMAL(10, 2),
  total_quantity DECIMAL(10, 3),
  total_promotion_cost DECIMAL(10, 2),
  total_storage_cost DECIMAL(10, 2)
)
```

**CTE структура:**
- `sales` - продажи из `ozon_accruals` (тип "Доставка покупателю")
- `promotion` - затраты на продвижение из `ozon_performance_daily` (SUM(money_spent))
- `storage` - стоимость хранения из `storage_costs`
- FULL OUTER JOIN всех трех источников

---

## 🚀 Deployment

### Последний коммит
**Hash:** 3da5efd
**Сообщение:** "Implement header-based CSV parsing for OZON Performance API"
**Ветка:** claude/ozon-performance-zip-support-hN0XE
**Дата:** 2025-12-23

**Файлы в коммите:**
- `supabase/functions/sync-ozon-performance/index.ts` (59 строк добавлено, 10 удалено)

### Деплой
- ✅ Изменения запушены в origin/claude/ozon-performance-zip-support-hN0XE
- ⏳ Edge Function должен автоматически задеплоиться через Lovable/Supabase интеграцию

---

## ✅ Следующие шаги (TODO)

1. **Дождаться деплоя Edge Function**
   - Проверить что версия 2.6.3 задеплоена
   - Можно проверить через test endpoint: `POST /sync-ozon-performance?test=true`

2. **Запустить синхронизацию заново**
   - Период: 17-18.12.2025 (есть тестовые данные)
   - Marketplace ID: UUID маркетплейса OZON

3. **Проверить логи Edge Function**
   - Должны появиться логи: `📋 Column indexes for "Блоки питания Лиза": {...}`
   - Проверить что все колонки найдены (нет -1 в индексах)

4. **Проверить данные в БД**
   ```sql
   -- Проверка orders_model для SKU 3107627916
   SELECT
     stat_date,
     campaign_name,
     sku,
     orders,
     orders_model,
     orders + COALESCE(orders_model, 0) as total_orders,
     revenue
   FROM ozon_performance_daily
   WHERE sku = '3107627916'
     AND stat_date BETWEEN '2025-12-17' AND '2025-12-18'
   ORDER BY stat_date, campaign_name;
   ```

5. **Проверить view promotion_costs_aggregated**
   ```sql
   SELECT
     cost_date,
     offer_id,
     total_orders,  -- Должно включать orders + orders_model
     total_revenue,
     promotion_cost
   FROM promotion_costs_aggregated
   WHERE sku = '3107627916'
     AND cost_date BETWEEN '2025-12-17' AND '2025-12-18';
   ```

6. **Проверить frontend**
   - Открыть страницу Sales Analytics
   - Выбрать период 17-18.12.2025
   - Найти SKU 3107627916
   - Проверить что количество заказов = 79 (71 + 8)
   - Проверить что выручка = 8850₽

7. **Применить миграции** (если еще не применены)
   ```bash
   npx supabase db push
   # или
   npx supabase migration up
   ```

---

## 🐛 Known Issues

### Issue 1: Неполный охват кампаний
**Описание:** Edge Function обрабатывает только 8 кампаний за раз (maxChunksPerRun = 1, chunkSize = 8)

**Логи:**
```
⚠️ Skipping 38 campaigns to avoid timeout
Processing first 1 chunks (8 campaigns)
```

**Причина:** Таймаут Supabase Edge Functions (150 секунд)

**Решение:** Запускать синхронизацию несколько раз подряд, или увеличить maxChunksPerRun

### Issue 2: Старые данные в БД
**Описание:** Данные с imported_at = 2025-12-20 14:59:54 (до фикса orders_model)

**Решение:**
- Пересинхронизировать данные для периода 17-18.12.2025
- Или удалить старые данные:
  ```sql
  DELETE FROM ozon_performance_daily
  WHERE stat_date BETWEEN '2025-12-17' AND '2025-12-18'
    AND imported_at < '2025-12-22';
  ```

---

## 📊 Схема данных

### Таблица: ozon_performance_daily
```sql
CREATE TABLE ozon_performance_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  marketplace_id UUID NOT NULL REFERENCES marketplaces(id),
  stat_date DATE NOT NULL,
  sku TEXT,
  offer_id TEXT,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_type TEXT,
  money_spent DECIMAL(10, 2) DEFAULT 0,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  orders INTEGER DEFAULT 0,
  orders_model INTEGER DEFAULT 0,  -- ДОБАВЛЕНО 2025-12-22
  revenue DECIMAL(10, 2),
  add_to_cart INTEGER,
  avg_bill DECIMAL(10, 2),
  ctr DECIMAL(5, 2),
  cpc DECIMAL(10, 2),
  conversion DECIMAL(5, 2),
  drr DECIMAL(5, 2),
  imported_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(marketplace_id, stat_date, sku, campaign_id)
);
```

### View: promotion_costs_aggregated
```sql
CREATE VIEW promotion_costs_aggregated AS
SELECT
  marketplace_id,
  stat_date as cost_date,
  offer_id,
  sku,
  SUM(money_spent) as promotion_cost,
  SUM(views) as total_views,
  SUM(clicks) as total_clicks,
  SUM(orders + COALESCE(orders_model, 0)) as total_orders,  -- !!!
  SUM(revenue) as total_revenue,
  AVG(ctr) as avg_ctr,
  AVG(cpc) as avg_cpc,
  AVG(conversion) as avg_conversion,
  AVG(drr) as avg_drr,
  MIN(imported_at) as first_imported_at,
  MAX(imported_at) as last_imported_at
FROM public.ozon_performance_daily
GROUP BY marketplace_id, stat_date, offer_id, sku;
```

---

## 🔐 Security & Permissions

### Edge Function
- Использует `service_role` ключ для записи в БД (обход RLS)
- CORS настроен для всех origins

### SQL Functions & Views
```sql
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_analytics TO service_role;

GRANT SELECT ON public.promotion_costs_aggregated TO authenticated;
GRANT SELECT ON public.promotion_costs_aggregated TO service_role;
```

---

## 📞 Контакты и ссылки

### OZON API Documentation
- Performance API: https://docs.ozon.ru/api/seller/#operation/PerformanceAPI_PerformanceReportInfo

### Repository
- Branch: claude/ozon-performance-zip-support-hN0XE
- Last commit: 3da5efd

### Key Files
- Edge Function: `/home/user/standalone-spark/supabase/functions/sync-ozon-performance/index.ts`
- Frontend Import: `/home/user/standalone-spark/src/pages/ImportData.tsx`
- Analytics Hook: `/home/user/standalone-spark/src/hooks/useSalesAnalytics.ts`
- Migrations: `/home/user/standalone-spark/supabase/migrations/20251222_*.sql`

---

## 💡 Важные замечания для следующего AI агента

1. **Всегда обновляй версию** - пользователь просил ВСЕГДА менять версию в файле после изменений

2. **Template-based Excel workflow** - пользователь использует workflow: скачать шаблон → заполнить данными → загрузить обратно

3. **Проверка на конкретном SKU** - пользователь просил проверять на SKU 3107627916 за период 17-18.12.2025

4. **OZON складывает orders + orders_model** - в их интерфейсе показывается сумма, в API приходят раздельно

5. **Разные типы кампаний = разные CSV** - это КРИТИЧНО! Стандартные 16 колонок, бонусные 17 колонок

6. **Точное совпадение для "Расход", "Заказы", "Продажи"** - иначе захватит "Расход за минусом бонусов", "Заказы модели" и т.д.

7. **Миграции могут быть не применены** - проверь что колонка `orders_model` существует в БД

8. **Edge Function деплоится автоматически** - через Lovable/Supabase при git push

---

**Конец документа**
**Автор:** Claude (AI Assistant)
**Дата:** 2025-12-23
