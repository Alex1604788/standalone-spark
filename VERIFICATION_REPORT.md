# Отчет о проверке деплоя

## Автоматическая проверка Edge Functions

### ✅ Успешно задеплоены:
- `auto-generate-drafts-cron` (HTTP 200)
- `process-scheduled-replies` (HTTP 200)

### ⚠️ Требуют внимания (HTTP 500):
- `auto-generate-drafts`
- `publish-reply`
- `sync-ozon`

**Примечание:** HTTP 500 может означать что функции задеплоены, но требуют аутентификации или параметров. Нужна ручная проверка.

---

## Что нужно проверить вручную

### 1. Проверка миграций (в Supabase SQL Editor)

Откройте SQL Editor и выполните:

```sql
-- Проверка функции cleanup_old_reviews
SELECT public.cleanup_old_reviews(9999);
```

**Ожидаемый результат:** JSON с информацией об очистке (должно быть 0 удалённых записей)

### 2. Проверка cron задач

```sql
-- Проверка URL для process-scheduled-replies
SELECT
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE command LIKE '%process-scheduled-replies%'
ORDER BY jobid DESC
LIMIT 3;
```

**Ожидаемый результат:** URL должен содержать правильный endpoint

### 3. Проверка OZON credentials

```sql
-- Проверка режима API
SELECT
  id,
  marketplace_type,
  mode,
  created_at
FROM marketplace_credentials
WHERE marketplace_type = 'ozon'
ORDER BY created_at DESC
LIMIT 5;
```

**Ожидаемый результат:** mode должен быть 'api' для Ozon Premium

### 4. Проверка Edge Functions (CLI)

```bash
export SUPABASE_ACCESS_TOKEN="sbp_5ff9cb7a1a678a7aad11fb7398dc810695b08a3a"
npx supabase functions list --project-ref bkmicyguzlwampuindff
```

**Ожидаемый результат:** Список всех функций с версиями и датами деплоя

---

## Рекомендации

1. **Если edge functions показывают HTTP 500:**
   - Проверьте логи функций в Supabase Dashboard
   - Убедитесь что переменные окружения настроены
   - Проверьте что функции не требуют обязательных параметров

2. **Для полной уверенности:**
   - Запустите тестовую генерацию ответа
   - Проверьте работу автопубликации
   - Убедитесь что sync-ozon работает корректно

3. **Проверьте фронтенд:**
   - Откройте приложение в Lovable
   - Проверьте страницу ConnectOzonAPI
   - Убедитесь что отображается правильный статус

---

## Файлы для проверки

- `test-deployment.sql` - SQL запросы для проверки
- `verify-deployment.sh` - bash скрипт для проверки
- `check-deployment.cjs` - Node.js скрипт для проверки

