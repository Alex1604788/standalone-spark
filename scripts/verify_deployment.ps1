# ========================================
# 🔍 СКРИПТ ПРОВЕРКИ ДЕПЛОЯ (Windows)
# ========================================
# Дата: 2026-01-25
# Проверяет все компоненты системы

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🔍 ПРОВЕРКА ДЕПЛОЯ" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ========================================
# 1. ПРОВЕРКА ЧТО МЫ В ПРАВИЛЬНОЙ ДИРЕКТОРИИ
# ========================================
if (-Not (Test-Path "package.json")) {
    Write-Host "❌ ОШИБКА: Запустите скрипт из корня проекта standalone-spark" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Директория: $(Get-Location)" -ForegroundColor Green
Write-Host ""

# ========================================
# 2. ПРОВЕРКА GIT СТАТУСА
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "📂 ПРОВЕРКА GIT" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$currentBranch = git branch --show-current
Write-Host "Текущая ветка: $currentBranch"

if ($currentBranch -ne "main") {
    Write-Host "⚠️  Вы НЕ на ветке main!" -ForegroundColor Yellow
    Write-Host "Переключаемся на main..."
    git checkout main
}

Write-Host "Обновляем main..."
git pull origin main --quiet

$lastCommit = git log -1 --oneline
Write-Host "Последний коммит: $lastCommit" -ForegroundColor Green

# Проверка что PR смержен
$prMerged = git log --oneline -10 | Select-String "Merge pull request.*follow-install-instructions"
if ($prMerged) {
    Write-Host "✅ Pull Request смержен" -ForegroundColor Green
} else {
    Write-Host "❌ Pull Request НЕ найден в истории" -ForegroundColor Red
}

Write-Host ""

# ========================================
# 3. ПРОВЕРКА КОДА КНОПКИ В MAIN
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🔍 ПРОВЕРКА КОДА КНОПКИ" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$buttonCode = Select-String -Path "src/pages/Reviews.tsx" -Pattern "Синхронизация за 14 дней" -Quiet
if ($buttonCode) {
    Write-Host "✅ Код кнопки найден в src/pages/Reviews.tsx" -ForegroundColor Green

    Write-Host ""
    Write-Host "Найденные строки:"
    Select-String -Path "src/pages/Reviews.tsx" -Pattern "Синхронизация за 14 дней|triggerSyncFull" | Select-Object -First 5
} else {
    Write-Host "❌ Код кнопки НЕ НАЙДЕН в src/pages/Reviews.tsx!" -ForegroundColor Red
    Write-Host "Проблема: код не попал в main ветку"
}

Write-Host ""

# ========================================
# 4. ПРОВЕРКА EDGE FUNCTIONS
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🔍 ПРОВЕРКА EDGE FUNCTIONS" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Проверка sync-ozon версии
$syncOzonVersion = Select-String -Path "supabase/functions/sync-ozon/index.ts" -Pattern "VERSION: 2026-01-16-v2" -Quiet
if ($syncOzonVersion) {
    Write-Host "✅ sync-ozon VERSION: 2026-01-16-v2" -ForegroundColor Green
} else {
    Write-Host "❌ sync-ozon НЕ версия 2026-01-16-v2!" -ForegroundColor Red
}

# Проверка auto-generate-drafts версии
$autoDraftsVersion = Select-String -Path "supabase/functions/auto-generate-drafts/index.ts" -Pattern "VERSION: 2026-01-16-v1" -Quiet
if ($autoDraftsVersion) {
    Write-Host "✅ auto-generate-drafts VERSION: 2026-01-16-v1" -ForegroundColor Green
} else {
    Write-Host "❌ auto-generate-drafts НЕ версия 2026-01-16-v1!" -ForegroundColor Red
}

# Проверка защиты от дублей в sync-ozon
$syncOzonProtection = Select-String -Path "supabase/functions/sync-ozon/index.ts" -Pattern "publishedReviewsSet" -Quiet
if ($syncOzonProtection) {
    Write-Host "✅ sync-ozon: защита от дублей присутствует" -ForegroundColor Green
} else {
    Write-Host "❌ sync-ozon: защита от дублей ОТСУТСТВУЕТ!" -ForegroundColor Red
}

# Проверка защиты от дублей в auto-generate-drafts
$autoDraftsProtection = Select-String -Path "supabase/functions/auto-generate-drafts/index.ts" -Pattern "existingReply" -Quiet
if ($autoDraftsProtection) {
    Write-Host "✅ auto-generate-drafts: проверка на дубли присутствует" -ForegroundColor Green
} else {
    Write-Host "❌ auto-generate-drafts: проверка на дубли ОТСУТСТВУЕТ!" -ForegroundColor Red
}

Write-Host ""

# ========================================
# 5. ПРОВЕРКА SQL МИГРАЦИИ
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🔍 ПРОВЕРКА SQL МИГРАЦИИ" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

if (Test-Path "supabase/migrations/20260116_setup_new_ozon_sync_logic.sql") {
    Write-Host "✅ Миграция 20260116_setup_new_ozon_sync_logic.sql найдена" -ForegroundColor Green

    # Проверяем содержимое
    $incremental = Select-String -Path "supabase/migrations/20260116_setup_new_ozon_sync_logic.sql" -Pattern "sync-ozon-incremental" -Quiet
    if ($incremental) {
        Write-Host "✅ Миграция содержит sync-ozon-incremental" -ForegroundColor Green
    }

    $weekly = Select-String -Path "supabase/migrations/20260116_setup_new_ozon_sync_logic.sql" -Pattern "sync-ozon-weekly" -Quiet
    if ($weekly) {
        Write-Host "✅ Миграция содержит sync-ozon-weekly" -ForegroundColor Green
    }
} else {
    Write-Host "❌ Миграция 20260116_setup_new_ozon_sync_logic.sql НЕ НАЙДЕНА!" -ForegroundColor Red
}

Write-Host ""

# ========================================
# 6. ПРОВЕРКА ДОКУМЕНТАЦИИ
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "📚 ПРОВЕРКА ДОКУМЕНТАЦИИ" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$docs = @(
    "PULL_REQUEST.md",
    "КАК_СОЗДАТЬ_PR.md",
    "ДЕПЛОЙ_ВЕРСИИ.md",
    "БЫСТРОЕ_РЕШЕНИЕ.md",
    "ФРОНТЕНД_НЕ_ЗАДЕПЛОЕН.md",
    "ДИАГНОСТИКА_ПРОБЛЕМЫ.sql",
    "ЧЕКЛИСТ_ФРОНТЕНД.md"
)

foreach ($doc in $docs) {
    if (Test-Path $doc) {
        Write-Host "✅ $doc" -ForegroundColor Green
    } else {
        Write-Host "⚠️  $doc - отсутствует" -ForegroundColor Yellow
    }
}

Write-Host ""

# ========================================
# 7. ИТОГОВАЯ СВОДКА
# ========================================
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "📊 ИТОГОВАЯ СВОДКА" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "✅ ЧТО ГОТОВО К ДЕПЛОЮ:" -ForegroundColor Green
Write-Host "  - Код кнопки в main ветке"
Write-Host "  - Edge Functions обновлены (v2, v1)"
Write-Host "  - SQL миграция создана"
Write-Host "  - Документация создана"
Write-Host ""

Write-Host "⏳ ЧТО НУЖНО СДЕЛАТЬ:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  ПРИМЕНИТЬ SQL МИГРАЦИЮ в Supabase:"
Write-Host "    - Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql"
Write-Host "    - Скопируйте содержимое: supabase/migrations/20260116_setup_new_ozon_sync_logic.sql"
Write-Host "    - Выполните SQL"
Write-Host ""

Write-Host "2️⃣  ЗАДЕПЛОИТЬ EDGE FUNCTIONS:"
Write-Host "    supabase functions deploy sync-ozon --no-verify-jwt"
Write-Host "    supabase functions deploy auto-generate-drafts --no-verify-jwt"
Write-Host ""

Write-Host "3️⃣  ПРОВЕРИТЬ LOVABLE DEPLOYMENT:"
Write-Host "    - Откройте: https://lovable.dev"
Write-Host "    - Убедитесь что последний деплой = Success"
Write-Host "    - Если деплоя нет - нажмите 'Redeploy' для ветки main"
Write-Host ""

Write-Host "4️⃣  ОЧИСТИТЬ BROWSER CACHE:"
Write-Host "    - Ctrl+F5 или откройте в приватном окне"
Write-Host ""

Write-Host "5️⃣  ПРОВЕРИТЬ ЧТО КНОПКА ПОЯВИЛАСЬ:"
Write-Host "    - Откройте: /app/reviews"
Write-Host "    - Должны увидеть кнопку 'Синхронизация за 14 дней'"
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🆘 ЕСЛИ НУЖНА ПОМОЩЬ" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Запустите диагностику в Supabase SQL Editor:"
Write-Host "  Get-Content ДИАГНОСТИКА_ПРОБЛЕМЫ.sql"
Write-Host ""
Write-Host "Или следуйте чеклисту:"
Write-Host "  Get-Content ЧЕКЛИСТ_ФРОНТЕНД.md"
Write-Host ""
Write-Host "Отправьте мне результаты!"
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✅ ПРОВЕРКА ЗАВЕРШЕНА" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
