# Инструкция по деплою функции auto-generate-drafts

## Способ 1: Через Supabase Dashboard (РЕКОМЕНДУЕТСЯ)

1. Откройте https://supabase.com/dashboard
2. Выберите проект: `bkmicyguzlwampuindff`
3. Перейдите в раздел **Edge Functions** (в левом меню)
4. Найдите функцию **auto-generate-drafts**
5. Нажмите **Deploy** или **Update**
6. Скопируйте содержимое файла `supabase/functions/auto-generate-drafts/index.ts`
7. Вставьте код в редактор и сохраните

## Способ 2: Через Supabase CLI

### Шаг 1: Проверьте, что вы авторизованы
```bash
supabase login
```

### Шаг 2: Свяжите проект (если еще не связан)
```bash
supabase link --project-ref bkmicyguzlwampuindff
```

### Шаг 3: Задеплойте функцию
```bash
supabase functions deploy auto-generate-drafts
```

## Способ 3: Через GitHub (автоматический)

Если у вас настроен автоматический деплой через Lovable.dev:
1. Закоммитьте изменения:
   ```bash
   git add -A
   git commit -m "Fix: Increase processing limit to 200, remove redundant check"
   git push
   ```
2. Lovable.dev автоматически синхронизирует изменения

## Что было изменено:

1. ✅ Увеличен лимит обработки с 100 до **200 отзывов** за запуск
2. ✅ Убрана избыточная проверка `existingReply` (ускоряет обработку)
3. ✅ Улучшено логирование для диагностики

## После деплоя:

1. Проверьте логи функции в Supabase Dashboard → Edge Functions → auto-generate-drafts → Logs
2. Дождитесь следующего запуска cron job (каждые 5 минут)
3. Проверьте, что отзывы обрабатываются быстрее

