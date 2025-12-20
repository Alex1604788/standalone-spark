# Проверка статуса автоматической генерации

## ✅ Что должно быть сделано:

### 1. Применена миграция (cron job)

**Проверка в Supabase Dashboard → SQL Editor:**
```sql
SELECT * FROM cron.job WHERE jobname = 'auto-generate-drafts-cron';
```

**Ожидаемый результат:**
- Должна быть одна запись
- `schedule` = `*/5 * * * *` (каждые 5 минут)
- `active` = `true`

**Если записи нет:**
Примените миграцию вручную:
1. Откройте Supabase Dashboard → SQL Editor
2. Скопируйте содержимое файла `supabase/migrations/20251209_add_auto_generate_drafts_cron.sql`
3. Выполните SQL

### 2. Задеплоена Edge Function

**Проверка в Supabase Dashboard:**
1. Откройте **Edge Functions** → **auto-generate-drafts-cron**
2. Должна быть видна функция с последним временем деплоя

**Если функции нет:**
Задеплойте через CLI:
```bash
supabase functions deploy auto-generate-drafts-cron --no-verify-jwt
```

Или через Supabase Dashboard:
1. Edge Functions → Deploy new function
2. Загрузите папку `supabase/functions/auto-generate-drafts-cron`

### 3. Проверка работы

**Проверьте логи:**
1. Supabase Dashboard → Edge Functions → auto-generate-drafts-cron → Logs
2. Должны быть записи каждые 5 минут с сообщениями:
   - `[auto-generate-drafts-cron] Starting automatic draft generation...`
   - `[auto-generate-drafts-cron] Found X active marketplaces`
   - `[auto-generate-drafts-cron] Completed: X processed`

**Проверьте таблицу replies:**
```sql
SELECT 
  COUNT(*) as total,
  status,
  created_at
FROM replies
WHERE created_at > NOW() - INTERVAL '10 minutes'
GROUP BY status, created_at
ORDER BY created_at DESC;
```

Должны появляться новые записи со статусом `scheduled` или `drafted`.

## 🔧 Если не работает:

### Проблема: Cron job не запускается

**Решение:**
1. Проверьте, что pg_cron включен:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```
2. Если нет, включите:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```

### Проблема: Функция возвращает ошибку

**Проверьте логи Edge Function:**
- Откройте Logs в Supabase Dashboard
- Найдите ошибки и исправьте их

### Проблема: Неправильный project_id

**Проверьте:**
- В миграции используется: `bkmicyguzlwampuindff`
- В client.ts используется: `bkmicyguzlwampuindff`
- Если project_id другой, обновите миграцию

## 📊 Мониторинг

**Проверка последнего запуска cron job:**
```sql
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  last_run_started_at,
  last_run_status
FROM cron.job
WHERE jobname = 'auto-generate-drafts-cron';
```

**Проверка статистики генерации:**
```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  status,
  COUNT(*) as count
FROM replies
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, status
ORDER BY hour DESC, status;
```



