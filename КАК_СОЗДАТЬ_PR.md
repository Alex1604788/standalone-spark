# 🔗 Как создать Pull Request

## Способ 1: Через веб-интерфейс GitHub (РЕКОМЕНДУЕТСЯ)

### Шаг 1: Откройте ссылку

Перейдите по ссылке (замените `Alex1604788/standalone-spark` на ваш репозиторий):

```
https://github.com/Alex1604788/standalone-spark/compare/main...claude/follow-install-instructions-2qPjk
```

### Шаг 2: Нажмите "Create pull request"

### Шаг 3: Заполните форму

**Title:**
```
Fix duplicate reply publishing + Add 14-day sync button
```

**Description:**
Скопируйте содержимое файла `PULL_REQUEST.md`

### Шаг 4: Нажмите "Create pull request"

---

## Способ 2: Через GitHub CLI (если установлен)

```bash
gh pr create \
  --base main \
  --head claude/follow-install-instructions-2qPjk \
  --title "Fix duplicate reply publishing + Add 14-day sync button" \
  --body-file PULL_REQUEST.md
```

---

## Способ 3: Автоматически (если настроен автодеплой)

GitHub может предложить создать PR автоматически после push.

Зайдите в репозиторий и посмотрите желтый баннер:
```
claude/follow-install-instructions-2qPjk had recent pushes
[Compare & pull request]
```

Нажмите на кнопку "Compare & pull request".

---

## ✅ После создания PR

1. **Проверьте** что все файлы включены:
   - src/pages/Reviews.tsx
   - supabase/functions/sync-ozon/index.ts
   - supabase/functions/auto-generate-drafts/index.ts
   - supabase/migrations/20260116_setup_new_ozon_sync_logic.sql
   - И другие (всего ~15 файлов)

2. **Убедитесь** что base ветка = `main`

3. **Добавьте label** (опционально):
   - `bug` - исправляет дубли
   - `enhancement` - новая кнопка
   - `high priority` - критично!

4. **Назначьте reviewer** (опционально)

5. **Нажмите "Create pull request"**

---

## 📊 Информация о PR

**Ветка:** `claude/follow-install-instructions-2qPjk` → `main`

**Коммитов:** 5
- Fix duplicate reply publishing
- New sync logic (10min/2days + weekly)
- Add 14-day sync button
- Documentation
- Troubleshooting guides

**Файлов изменено:** ~15

**Критичность:** ВЫСОКАЯ (исправляет повторные публикации)

---

## ⚠️ Важно после мерджа

**ОБЯЗАТЕЛЬНО задеплоить Edge Functions:**
```bash
supabase functions deploy sync-ozon --no-verify-jwt
supabase functions deploy auto-generate-drafts --no-verify-jwt
```

И применить SQL миграцию через Supabase SQL Editor.

Подробности в `PULL_REQUEST.md`.

---

## 🆘 Если нужна помощь

Скажите мне и я помогу создать PR!
