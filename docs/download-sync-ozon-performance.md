# Как скачать актуальную версию `sync-ozon-performance`

Ниже краткая инструкция, как получить последнюю версию функции `supabase/functions/sync-ozon-performance/index.ts` из репозитория.

## Через Git (рекомендуется)
1. Откройте терминал в корне проекта.
2. Обновите ветку: `git pull`.
3. Сохраните файл на диск, если нужно отдельно: 
   - `cp supabase/functions/sync-ozon-performance/index.ts /tmp/sync-ozon-performance.ts` или любой другой путь.

## Скачивание только файла через `curl`
1. Найдите URL «Raw» файла в Git-провайдере (GitHub/GitLab). Обычно он выглядит как `https://.../supabase/functions/sync-ozon-performance/index.ts?plain=1` или `.../raw/.../supabase/functions/sync-ozon-performance/index.ts`.
2. Выполните: `curl -L -o index.ts "<RAW_URL>"` — файл сохранится в текущую директорию.

## Если нужен архив всего проекта
1. В веб-интерфейсе Git-провайдера нажмите **Download ZIP** (обычно кнопка Code/Download). 
2. Распакуйте архив и возьмите файл по пути `supabase/functions/sync-ozon-performance/index.ts`.

## Быстрая проверка версии
После скачивания убедитесь, что файл содержит ожидаемые изменения:
- Просмотрите заголовок файла: `head -n 20 supabase/functions/sync-ozon-performance/index.ts`.
- При необходимости проверьте хеш коммита: `git log -1 --oneline -- supabase/functions/sync-ozon-performance/index.ts`.

Эти шаги помогут взять актуальный вариант функции без дополнительных настроек.
