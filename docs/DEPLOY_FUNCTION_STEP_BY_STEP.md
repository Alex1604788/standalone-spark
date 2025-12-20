# Пошаговая инструкция: Как задеплоить функцию auto-generate-drafts-cron

## Способ 1: Через Supabase Dashboard (рекомендуется)

### Шаг 1: Подготовка файлов

1. Откройте папку проекта: `C:\360ExtremeBrowserDownload\standalone-spark`
2. Найдите папку: `supabase\functions\auto-generate-drafts-cron`
3. В этой папке должен быть файл `index.ts`

### Шаг 2: Зайти в Supabase Dashboard

1. Откройте браузер
2. Перейдите на https://supabase.com/dashboard
3. Войдите в свой аккаунт
4. Выберите проект `ozon-sales-analytics` (или ваш проект)

### Шаг 3: Создать новую функцию

1. В левом меню найдите раздел **"Edge Functions"**
2. Нажмите на **"Edge Functions"** (или "Functions")
3. В правом верхнем углу найдите кнопку **"Deploy new function"** или **"New function"** или **"+"**
4. Нажмите на эту кнопку

### Шаг 4: Загрузить код функции

**Вариант А: Если есть возможность загрузить папку**
1. Выберите опцию "Upload" или "Deploy from folder"
2. Выберите папку `supabase\functions\auto-generate-drafts-cron`
3. Нажмите "Deploy"

**Вариант Б: Если нужно создать вручную**
1. Нажмите "Create new function"
2. Введите имя функции: `auto-generate-drafts-cron`
3. Скопируйте весь код из файла `supabase\functions\auto-generate-drafts-cron\index.ts`
4. Вставьте код в редактор
5. Нажмите "Deploy" или "Save"

### Шаг 5: Проверка

1. После деплоя функция должна появиться в списке Edge Functions
2. Нажмите на функцию `auto-generate-drafts-cron`
3. Должна открыться страница с вкладками: Overview, Invocations, Logs, Code, Details

---

## Способ 2: Через Supabase CLI (если Dashboard не работает)

### Шаг 1: Установить Supabase CLI (если еще не установлен)

**Windows (через PowerShell):**
```powershell
# Через Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Или через npm
npm install -g supabase
```

### Шаг 2: Войти в Supabase

```bash
supabase login
```
Откроется браузер для авторизации.

### Шаг 3: Привязать проект

```bash
supabase link --project-ref bkmicyguzlwampuindff
```

### Шаг 4: Задеплоить функцию

```bash
cd C:\360ExtremeBrowserDownload\standalone-spark
supabase functions deploy auto-generate-drafts-cron --no-verify-jwt
```

### Шаг 5: Проверка

```bash
supabase functions list
```
Должна быть в списке `auto-generate-drafts-cron`.

---

## Что делать, если не получается?

### Проблема: Не вижу кнопку "Deploy new function"

**Решение:**
1. Проверьте, что вы в правильном проекте
2. Убедитесь, что у вас есть права администратора
3. Попробуйте обновить страницу

### Проблема: Ошибка при деплое через Dashboard

**Решение:**
1. Скопируйте код из `supabase\functions\auto-generate-drafts-cron\index.ts`
2. Создайте функцию вручную через Dashboard
3. Вставьте код и сохраните

### Проблема: CLI не работает

**Решение:**
1. Используйте Способ 1 (через Dashboard)
2. Или попросите помощи у администратора проекта

---

## После деплоя

1. ✅ Функция должна появиться в списке Edge Functions
2. ✅ Можно открыть функцию и посмотреть логи
3. ✅ Cron job будет вызывать эту функцию каждые 5 минут

## Проверка работы

После деплоя проверьте:
1. Откройте функцию `auto-generate-drafts-cron` → вкладка "Logs"
2. Должны появиться логи каждые 5 минут
3. Или подождите 5 минут и проверьте логи снова



