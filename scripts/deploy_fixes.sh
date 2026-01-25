#!/bin/bash

# Деплой исправлений для предотвращения дублей replies
# VERSION: 2026-01-16-v2

set -e

echo "=========================================="
echo "🚀 Деплой исправлений OZON синхронизации"
echo "=========================================="
echo ""

# Проверка что находимся в корне проекта
if [ ! -d "supabase/functions" ]; then
    echo "❌ ОШИБКА: Запустите скрипт из корня проекта!"
    exit 1
fi

# Проверка что Supabase CLI установлен
if ! command -v supabase &> /dev/null; then
    echo "❌ ОШИБКА: Supabase CLI не установлен!"
    echo ""
    echo "Установите:"
    echo "  macOS:   brew install supabase/tap/supabase"
    echo "  Windows: scoop install supabase"
    echo "  Linux:   brew install supabase/tap/supabase"
    exit 1
fi

echo "✅ Supabase CLI найден"
echo ""

# Проверка версий функций
echo "📦 Проверка версий функций..."
echo ""

SYNC_VERSION=$(head -3 supabase/functions/sync-ozon/index.ts | grep "VERSION:" || echo "NOT FOUND")
AUTO_VERSION=$(head -9 supabase/functions/auto-generate-drafts/index.ts | grep "VERSION:" || echo "NOT FOUND")

echo "sync-ozon:           $SYNC_VERSION"
echo "auto-generate-drafts: $AUTO_VERSION"
echo ""

if [[ ! "$SYNC_VERSION" =~ "2026-01-16-v2" ]]; then
    echo "⚠️  ВНИМАНИЕ: sync-ozon не версии v2!"
fi

if [[ ! "$AUTO_VERSION" =~ "2026-01-16-v1" ]]; then
    echo "⚠️  ВНИМАНИЕ: auto-generate-drafts не версии v1!"
fi

echo ""
read -p "Продолжить деплой? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Отменено"
    exit 1
fi

echo ""
echo "=========================================="
echo "📤 Деплой sync-ozon..."
echo "=========================================="
supabase functions deploy sync-ozon --no-verify-jwt

echo ""
echo "=========================================="
echo "📤 Деплой auto-generate-drafts..."
echo "=========================================="
supabase functions deploy auto-generate-drafts --no-verify-jwt

echo ""
echo "=========================================="
echo "✅ ДЕПЛОЙ ЗАВЕРШЕН!"
echo "=========================================="
echo ""
echo "Что дальше:"
echo "1. Откройте Supabase SQL Editor"
echo "2. Запустите запросы из ПРОВЕРКА_СИНХРОНИЗАЦИИ.sql"
echo "3. Проверьте что синхронизация работает (подождите 10-15 минут)"
echo "4. Проверьте логи в Supabase Dashboard → Edge Functions"
echo ""
echo "Ожидаемые логи sync-ozon:"
echo "  [sync-ozon] Found N reviews with published replies"
echo ""
echo "Ожидаемые логи auto-generate-drafts:"
echo "  [auto-generate-drafts] Skip review XXX: reply exists"
echo ""
