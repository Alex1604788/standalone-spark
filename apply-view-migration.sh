#!/bin/bash

# Script to apply the ozon_performance_summary VIEW migration

if [ ! -f .env.local ]; then
    echo "❌ Файл .env.local не найден"
    echo "📝 Создайте файл .env.local с переменными:"
    echo "   SUPABASE_URL=your-supabase-url"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
    exit 1
fi

source .env.local

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Переменные окружения не установлены"
    echo "📝 Проверьте файл .env.local"
    exit 1
fi

echo "🚀 Применение миграции VIEW ozon_performance_summary"
echo "========================================"
echo ""

# Read the migration file
MIGRATION_SQL=$(cat supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql)

# Apply migration via Supabase SQL API
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$MIGRATION_SQL" | jq -Rs .)}")

echo "📊 Результат применения миграции:"
echo "$RESPONSE"
echo ""

# Check if VIEW exists
echo "🔍 Проверка создания VIEW..."
VIEW_CHECK=$(curl -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>&1)

if echo "$VIEW_CHECK" | grep -q "does not exist"; then
    echo "❌ VIEW не создан"
    echo "📝 Примените миграцию вручную через Supabase SQL Editor:"
    echo "   https://supabase.com/dashboard/project/$(basename $SUPABASE_URL)/sql/new"
    echo ""
    echo "Содержимое миграции:"
    echo "---"
    cat supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql
    exit 1
elif echo "$VIEW_CHECK" | grep -q "\["; then
    echo "✅ VIEW успешно создан!"
    echo ""
    echo "📊 Проверка данных:"
    COUNT=$(echo "$VIEW_CHECK" | grep -o '"id"' | wc -l)
    echo "   Найдено записей: $COUNT"

    # Get sample data
    echo "$VIEW_CHECK" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'   Дата: {d.get(\"stat_date\", \"N/A\")}')
    print(f'   Кампания: {d.get(\"campaign_name\", \"N/A\")}')
    print(f'   total_orders: {d.get(\"total_orders\", 0)}')
    print(f'   total_revenue: {d.get(\"total_revenue\", 0)}')
except Exception as e:
    print(f'   (не удалось распарсить данные)')
" 2>/dev/null
    echo ""
    echo "✅ Данные должны появиться в приложении"
    echo "   Обновите страницу (F5) в разделе 'Аналитика Продвижений'"
else
    echo "⚠️ Неизвестный статус"
    echo "Ответ сервера:"
    echo "$VIEW_CHECK"
fi

echo ""
echo "========================================"
