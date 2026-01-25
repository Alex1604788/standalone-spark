# Деплой исправлений для предотвращения дублей replies
# VERSION: 2026-01-16-v2

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "🚀 Деплой исправлений OZON синхронизации" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Проверка что находимся в корне проекта
if (-not (Test-Path "supabase\functions")) {
    Write-Host "❌ ОШИБКА: Запустите скрипт из корня проекта!" -ForegroundColor Red
    exit 1
}

# Проверка что Supabase CLI установлен
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ОШИБКА: Supabase CLI не установлен!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите через scoop:"
    Write-Host "  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git"
    Write-Host "  scoop install supabase"
    exit 1
}

Write-Host "✅ Supabase CLI найден" -ForegroundColor Green
Write-Host ""

# Проверка версий функций
Write-Host "📦 Проверка версий функций..." -ForegroundColor Yellow
Write-Host ""

$syncVersion = Get-Content "supabase\functions\sync-ozon\index.ts" -Head 3 | Select-String "VERSION:" | Out-String
$autoVersion = Get-Content "supabase\functions\auto-generate-drafts\index.ts" -Head 9 | Select-String "VERSION:" | Out-String

Write-Host "sync-ozon:           $($syncVersion.Trim())"
Write-Host "auto-generate-drafts: $($autoVersion.Trim())"
Write-Host ""

if (-not ($syncVersion -match "2026-01-16-v2")) {
    Write-Host "⚠️  ВНИМАНИЕ: sync-ozon не версии v2!" -ForegroundColor Yellow
}

if (-not ($autoVersion -match "2026-01-16-v1")) {
    Write-Host "⚠️  ВНИМАНИЕ: auto-generate-drafts не версии v1!" -ForegroundColor Yellow
}

Write-Host ""
$response = Read-Host "Продолжить деплой? (y/n)"

if ($response -ne 'y' -and $response -ne 'Y') {
    Write-Host "❌ Отменено" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "📤 Деплой sync-ozon..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
supabase functions deploy sync-ozon --no-verify-jwt

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "📤 Деплой auto-generate-drafts..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
supabase functions deploy auto-generate-drafts --no-verify-jwt

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ ДЕПЛОЙ ЗАВЕРШЕН!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Что дальше:" -ForegroundColor Yellow
Write-Host "1. Откройте Supabase SQL Editor"
Write-Host "2. Запустите запросы из ПРОВЕРКА_СИНХРОНИЗАЦИИ.sql"
Write-Host "3. Проверьте что синхронизация работает (подождите 10-15 минут)"
Write-Host "4. Проверьте логи в Supabase Dashboard → Edge Functions"
Write-Host ""
Write-Host "Ожидаемые логи sync-ozon:" -ForegroundColor Cyan
Write-Host "  [sync-ozon] Found N reviews with published replies"
Write-Host ""
Write-Host "Ожидаемые логи auto-generate-drafts:" -ForegroundColor Cyan
Write-Host "  [auto-generate-drafts] Skip review XXX: reply exists"
Write-Host ""
