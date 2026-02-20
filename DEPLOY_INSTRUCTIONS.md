# Инструкции по деплою изменений

## Что было добавлено в main

### 1. Новые миграции (нужно применить)
- `supabase/migrations/20260219000001_migrate_ozon_credentials_to_api_mode.sql`
- `supabase/migrations/20260219_fix_process_scheduled_replies_cron_url.sql`
- `supabase/migrations/20260220_create_cleanup_old_reviews_function.sql`

### 2. Изменённые Edge Functions (нужно задеплоить)
- `auto-generate-drafts-cron`
- `auto-generate-drafts`
- `process-scheduled-replies`
- `publish-reply`
- `sync-ozon`

### 3. Изменения во фронтенде
- `src/lib/reviewHelpers.ts`
- `src/pages/ConnectOzonAPI.tsx`
- `src/pages/Reviews.tsx`

---

## Вариант 1: Автоматический деплой (рекомендуется)

```bash
./AUTO_DEPLOY.sh
```

---

## Вариант 2: Ручной деплой

### Шаг 1: Применить миграции через Supabase Dashboard

1. Откройте SQL Editor: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/editor
2. Выполните каждую миграцию:
   - `supabase/migrations/20260219000001_migrate_ozon_credentials_to_api_mode.sql`
   - `supabase/migrations/20260219_fix_process_scheduled_replies_cron_url.sql`
   - `supabase/migrations/20260220_create_cleanup_old_reviews_function.sql`

### Шаг 2: Задеплоить Edge Functions

```bash
export SUPABASE_ACCESS_TOKEN="sbp_5ff9cb7a1a678a7aad11fb7398dc810695b08a3a"

npx supabase functions deploy auto-generate-drafts-cron --project-ref bkmicyguzlwampuindff
npx supabase functions deploy auto-generate-drafts --project-ref bkmicyguzlwampuindff
npx supabase functions deploy process-scheduled-replies --project-ref bkmicyguzlwampuindff --no-verify-jwt
npx supabase functions deploy publish-reply --project-ref bkmicyguzlwampuindff --no-verify-jwt
npx supabase functions deploy sync-ozon --project-ref bkmicyguzlwampuindff --no-verify-jwt
```

Project Ref: bkmicyguzlwampuindff
