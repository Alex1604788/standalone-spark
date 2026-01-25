#!/bin/bash
source .env.local

echo "📊 ПРОВЕРКА СИНХРОНИЗАЦИИ"
echo "========================================"
echo ""

# Последняя синхронизация
echo "1. ПОСЛЕДНЯЯ СИНХРОНИЗАЦИЯ:"
echo "----------------------------------------"
LAST=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_sync_history?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&order=started_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "$LAST" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'ID: {d[\"id\"][:13]}...')
    print(f'Статус: {d[\"status\"]}')
    print(f'Начало: {d[\"started_at\"][:19]}')
    print(f'Окончание: {d[\"completed_at\"][:19] if d[\"completed_at\"] else \"не завершена\"}')
    print(f'Кампаний: {d.get(\"campaigns_count\") or \"не указано\"}')
    print(f'Записей: {d.get(\"rows_inserted\", 0)}')
    if d.get('error_message'):
        print(f'Ошибка: {d[\"error_message\"][:100]}')
    else:
        print('Ошибок: нет')
except Exception as e:
    print(f'Ошибка парсинга: {e}')
"
echo ""

# Данные в таблице
echo "2. ДАННЫЕ В ТАБЛИЦЕ:"
echo "----------------------------------------"
FIRST=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_daily?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=stat_date&order=stat_date.asc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null | grep -o '"stat_date":"[^"]*"' | cut -d'"' -f4)

LAST_DATE=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_daily?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=stat_date&order=stat_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null | grep -o '"stat_date":"[^"]*"' | cut -d'"' -f4)

if [ -n "$FIRST" ] && [ -n "$LAST_DATE" ]; then
    DAYS=$((( $(date -d "$LAST_DATE" +%s) - $(date -d "$FIRST" +%s) ) / 86400 + 1))
    echo "Первая дата: $FIRST"
    echo "Последняя дата: $LAST_DATE"
    echo "Период: $DAYS дней"

    if [ $DAYS -ge 62 ]; then
        echo "✅ Данные за 62+ дня"
    else
        echo "⚠️ Меньше 62 дней"
    fi
else
    echo "❌ Нет данных"
fi
echo ""

# Проверка VIEW
echo "3. ПРОВЕРКА VIEW:"
echo "----------------------------------------"
VIEW_TEST=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>&1)

if echo "$VIEW_TEST" | grep -q "does not exist"; then
    echo "❌ VIEW не существует"
elif echo "$VIEW_TEST" | grep -q "\["; then
    echo "✅ VIEW работает"
    echo "$VIEW_TEST" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'  total_orders: {d.get(\"total_orders\", 0)}')
    print(f'  total_revenue: {d.get(\"total_revenue\", 0)}')
except:
    pass
" 2>/dev/null
else
    echo "⚠️ Ошибка проверки"
fi

echo ""
echo "========================================"
