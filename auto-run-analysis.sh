#!/bin/bash

# Скрипт для автоматического запуска анализа через Supabase REST API

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "🔍 АВТОМАТИЧЕСКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES"
echo "========================================"
echo ""

# Проверяем доступность psql
if command -v psql &> /dev/null; then
    echo "⚠️  Для запуска анализа через psql нужна строка подключения к БД"
    echo ""
    echo "📋 ИНСТРУКЦИЯ:"
    echo "1. Открой: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/settings/database"
    echo "2. Найди 'Connection string' -> 'URI'"
    echo "3. Скопируй строку подключения"
    echo "4. Замени [YOUR-PASSWORD] на свой пароль"
    echo "5. Запусти команду:"
    echo ""
    echo "   export SUPABASE_DB_URL='postgresql://postgres.bkmicyguzlwampuindff:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'"
    echo "   psql \$SUPABASE_DB_URL -f AUTO_ANALYZE_REPLIES.sql"
    echo ""
else
    echo "❌ psql не найден"
fi

echo ""
echo "💡 АЛЬТЕРНАТИВА: Запусти анализ вручную в браузере:"
echo "   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new"
echo "   и вставь содержимое AUTO_ANALYZE_REPLIES.sql"
echo ""
