# 🚀 Инструкция по применению VIEW миграции

## Проблема
Данные не отображаются в приложении, потому что VIEW `ozon_performance_summary` не создан в базе данных.

## Решение создано
Миграция создана: `supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql`

---

## Способ 1: Через Supabase Dashboard (РЕКОМЕНДУЕТСЯ)

### Шаги:

1. **Откройте Supabase SQL Editor:**
   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new

2. **Скопируйте содержимое миграции:**
   ```bash
   cat supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql
   ```

3. **Вставьте в SQL Editor и нажмите "Run"** (▶️)

4. **Проверьте результат:**
   ```sql
   SELECT COUNT(*) FROM ozon_performance_summary;
   ```
   Должно вернуть количество записей.

5. **Обновите приложение** (F5) и проверьте раздел "Аналитика Продвижений"

---

## Способ 2: Через Node.js скрипт (если есть DATABASE_URL)

### Требования:
- Переменная окружения `DATABASE_URL` или `SUPABASE_DB_URL`

### Команда:
```bash
export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"
node scripts/apply-view-migration.mjs
```

---

## Способ 3: Через Bash скрипт (если есть .env.local)

### Требования:
- Файл `.env.local` с переменными:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Команда:
```bash
./apply-view-migration.sh
```

---

## Что даст эта миграция?

✅ **VIEW `ozon_performance_summary` будет создан**

✅ **Автоматическое суммирование:**
   - `orders + orders_model` → `total_orders`
   - `revenue + revenue_model` → `total_revenue`

✅ **Автоматический расчёт метрик:**
   - CTR (Click-Through Rate)
   - CPC (Cost Per Click)
   - Conversion Rate
   - DRR (Direct Response Rate)
   - ROI (Return on Investment)

✅ **Данные появятся в разделе "Аналитика Продвижений"**

---

## Проверка после применения

```sql
-- Проверить что VIEW создан
SELECT COUNT(*) FROM ozon_performance_summary;

-- Получить последние данные
SELECT
  stat_date,
  campaign_name,
  SUM(total_orders) as total_orders,
  SUM(total_revenue) as total_revenue,
  SUM(money_spent) as money_spent
FROM ozon_performance_summary
WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY stat_date, campaign_name
ORDER BY stat_date DESC
LIMIT 10;
```

---

## Если возникли проблемы

### Ошибка: "relation does not exist"
→ VIEW не создан, повторите применение миграции

### Ошибка: "permission denied"
→ Проверьте права доступа к базе данных

### Данные всё равно не появились
1. Проверьте, есть ли данные в базовой таблице:
   ```sql
   SELECT COUNT(*) FROM ozon_performance_daily;
   ```
2. Если `count: 0`, запустите синхронизацию OZON

---

## 💡 Рекомендация

**Используйте Способ 1** (Supabase Dashboard) - это самый простой и надёжный способ.
