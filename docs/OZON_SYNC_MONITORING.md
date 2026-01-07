# OZON Performance Sync - Мониторинг и Логика Работы

## 🔍 ГДЕ СМОТРЕТЬ СТАТУС СИНХРОНИЗАЦИИ

### 1. **Supabase Dashboard - Table Editor** (ОСНОВНОЙ СПОСОБ)

**Таблица: `ozon_sync_history`**
- URL: `https://supabase.com/dashboard/project/bkmicyguzlwampuindff/editor/34621`
- Фильтр: `marketplace_id = 84b1d0f5-6750-407c-9b04-28c051972162`
- Сортировка: `started_at DESC`

**Что смотреть:**
```
| started_at          | status      | period_from | period_to  | rows_inserted | metadata.current_offset |
|---------------------|-------------|-------------|------------|---------------|------------------------|
| 2026-01-07 13:17:34 | completed   | 2025-11-06  | 2026-01-07 | 1720          | 44                     |
| 2026-01-07 13:16:35 | completed   | 2025-11-06  | 2026-01-07 | 446           | 40                     |
```

**Статусы:**
- ✅ `completed` - батч завершен успешно
- ⏳ `in_progress` - батч выполняется (если >5 минут - зависло)
- ❌ `failed` - ошибка

### 2. **Supabase Dashboard - Table Editor** (ДАННЫЕ)

**Таблица: `ozon_performance_daily`**
- Фильтр: `marketplace_id = 84b1d0f5-6750-407c-9b04-28c051972162`
- Сортировка: `stat_date DESC`

**Что проверять:**
- Общее количество записей (показано внизу таблицы)
- Диапазон дат: MIN(stat_date) → MAX(stat_date)
- Данные за последние дни

### 3. **REST API Запросы** (ДЛЯ АВТОМАТИЗАЦИИ)

**Последняя синхронизация:**
```bash
curl -s 'https://bkmicyguzlwampuindff.supabase.co/rest/v1/ozon_sync_history?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&order=started_at.desc&limit=1' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" | jq .
```

**Количество записей в БД:**
```bash
curl -s 'https://bkmicyguzlwampuindff.supabase.co/rest/v1/ozon_performance_daily?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=count' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -I | grep content-range
```

### 4. **Edge Function Logs** (ДЛЯ ОТЛАДКИ)

**Supabase Dashboard → Functions → sync-ozon-performance → Logs**

Ключевые логи:
```
🚀 OZON Performance Sync starting - VERSION: 3.0.6-auto-continue-fix
Processing chunk 1 with 2 campaigns
✅ Saved 48 records for campaign Кабель ПВС черный 3
🔄 AUTO-CONTINUE: Triggering next batch (offset 4 of 55)
```

---

## 📅 ЛОГИКА РАБОТЫ: 62 ДНЯ vs 7 ДНЕЙ

### **FULL SYNC (62 дня)** - Ручной запуск

**Когда использовать:**
- Первая синхронизация
- После сбоя/перерыва
- Обновление исторических данных

**Параметры:**
```json
{
  "marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162",
  "sync_period": "full"
}
```

**Поведение:**
- Период: **2025-11-06 → 2026-01-07** (62 дня назад от сегодня)
- Батчи: **4 кампании** за раз (2 чанка × 2)
- Auto-continue: **ДА** - автоматически обрабатывает все 55 кампаний
- Итераций: **~14** (55 / 4 = 13.75)
- Время: **~15-20 минут** (60-90 секунд на батч)

**Как работает:**
1. Обрабатывает 4 кампании (offset 0-3)
2. Сохраняет данные в БД
3. Завершает запись sync_history как `completed`
4. **Автоматически** вызывает себя с offset=4
5. Повторяет пока offset < 55

**Метаданные:**
```json
{
  "version": "3.0.6-auto-continue-fix",
  "sync_period": "full",
  "current_offset": 44,
  "total_campaigns": 55,
  "has_more": true,
  "auto_continue": true
}
```

---

### **DAILY SYNC (7 дней)** - Автоматический запуск (CRON)

**Когда использовать:**
- Ежедневное обновление
- Запуск через cron (планируется)
- Быстрая синхронизация свежих данных

**Параметры:**
```json
{
  "marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162",
  "sync_period": "daily"
}
```

**Поведение:**
- Период: **последние 7 дней** от сегодня
- Батчи: **8 кампаний** за раз (4 чанка × 2)
- Auto-continue: **НЕТ** - обрабатывает только первые 8 кампаний
- Итераций: **1** (для скорости)
- Время: **~90 секунд**

**Метаданные:**
```json
{
  "version": "3.0.6-auto-continue-fix",
  "sync_period": "daily",
  "current_offset": 8,
  "total_campaigns": 55,
  "has_more": false,
  "auto_continue": false
}
```

---

## 🔄 AUTO-CONTINUE CHAIN (FULL режим)

**Алгоритм:**
```
1. Edge Function запускается с offset=0, sync_period='full'
2. Обрабатывает 4 кампании (0-3)
3. Сохраняет данные в ozon_performance_daily
4. Обновляет sync_history:
   - status = 'completed'
   - current_offset = 4
   - has_more = true
5. Вызывает сам себя: POST /sync-ozon-performance
   - marketplace_id: тот же
   - sync_period: 'full'
   - campaign_offset: 4
6. Повторяет шаги 2-5 пока offset < total_campaigns
7. Последний батч (offset 52-55):
   - has_more = false
   - auto_continue = false
   - Цепочка завершается
```

**Визуализация:**
```
Batch 1: offset 0  → 4   [✓ completed]  → triggers Batch 2
Batch 2: offset 4  → 8   [✓ completed]  → triggers Batch 3
Batch 3: offset 8  → 12  [✓ completed]  → triggers Batch 4
...
Batch 13: offset 48 → 52 [✓ completed]  → triggers Batch 14
Batch 14: offset 52 → 55 [✓ completed]  → DONE (has_more=false)
```

---

## ⚠️ ПРОБЛЕМЫ И РЕШЕНИЯ

### Проблема 1: Зависшие синхронизации (in_progress >10 минут)

**SQL для очистки:**
```sql
UPDATE ozon_sync_history
SET status = 'failed', completed_at = NOW()
WHERE status = 'in_progress'
  AND started_at < NOW() - INTERVAL '10 minutes';
```

### Проблема 2: OZON API лимит "Превышен лимит активных запросов"

**Решение:**
- v3.0.6+ автоматически делает retry с задержкой 30-60 секунд
- До 3 попыток перед возвратом ошибки
- Если все 3 попытки failed → campaign пропускается

### Проблема 3: Auto-continue остановился

**Проверка:**
```sql
SELECT * FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND status = 'completed'
  AND metadata->>'has_more' = 'true'
  AND metadata->>'auto_continue' = 'true'
ORDER BY started_at DESC
LIMIT 1;
```

**Ручное продолжение:**
```bash
curl -X POST 'https://bkmicyguzlwampuindff.supabase.co/functions/v1/sync-ozon-performance' \
  -H 'Authorization: Bearer SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162",
    "sync_period": "full",
    "campaign_offset": 44
  }'
```

---

## 📊 МЕТРИКИ И KPI

### Успешная синхронизация (FULL):
- ✅ 55 записей в `ozon_sync_history` со status='completed'
- ✅ ~3000-8000 записей в `ozon_performance_daily` (зависит от активности кампаний)
- ✅ Диапазон дат: 2025-11-06 → 2026-01-07 (62 дня)
- ✅ Все батчи завершены за 15-20 минут

### Показатели производительности:
- Время на 1 батч: 60-90 секунд
- Обработка 1 кампании: 15-20 секунд
- Среднее rows_inserted на батч: 100-500 (зависит от кампании)

---

## 🛠️ КОМАНДЫ ДЛЯ МОНИТОРИНГА

### Последняя синхронизация:
```bash
psql $DATABASE_URL -c "
SELECT
  started_at,
  status,
  period_from,
  period_to,
  rows_inserted,
  metadata->>'current_offset' as offset,
  metadata->>'total_campaigns' as total,
  metadata->>'version' as version
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
ORDER BY started_at DESC
LIMIT 5;
"
```

### Прогресс full sync:
```bash
psql $DATABASE_URL -c "
SELECT
  COUNT(*) as batches_completed,
  MAX((metadata->>'current_offset')::int) as last_offset,
  (SELECT metadata->>'total_campaigns'
   FROM ozon_sync_history
   WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
   LIMIT 1)::int as total_campaigns
FROM ozon_sync_history
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162'
  AND metadata->>'sync_period' = 'full'
  AND status = 'completed'
  AND started_at > NOW() - INTERVAL '1 hour';
"
```

### Диапазон загруженных данных:
```bash
psql $DATABASE_URL -c "
SELECT
  COUNT(*) as total_records,
  MIN(stat_date) as earliest_date,
  MAX(stat_date) as latest_date,
  COUNT(DISTINCT campaign_id) as unique_campaigns
FROM ozon_performance_daily
WHERE marketplace_id = '84b1d0f5-6750-407c-9b04-28c051972162';
"
```
