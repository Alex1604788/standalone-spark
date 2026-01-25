#!/bin/bash

source .env.local

MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"
BASE_URL="${SUPABASE_URL}/rest/v1"
HEADERS="-H 'apikey: ${SUPABASE_SERVICE_ROLE_KEY}' -H 'Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}'"

echo "========================================"
echo "🔍 АНАЛИЗ СИНХРОНИЗАЦИИ OZON PERFORMANCE"
echo "========================================"
echo ""

echo "1️⃣ ПОСЛЕДНЯЯ СИНХРОНИЗАЦИЯ"
echo "----------------------------------------"
LAST_SYNC=$(curl -k -s "${BASE_URL}/ozon_sync_history?marketplace_id=eq.${MARKETPLACE_ID}&order=started_at.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "$LAST_SYNC" | grep -q "in_progress" && echo "⚠️ ЗАВИСШАЯ СИНХРОНИЗАЦИЯ!" || echo ""
echo "$LAST_SYNC" | sed 's/.*"status":"\([^"]*\)".*/Статус: \1/'
echo "$LAST_SYNC" | sed 's/.*"started_at":"\([^"]*\)".*/Начало: \1/'
echo "$LAST_SYNC" | sed 's/.*"completed_at":\([^,}]*\).*/Окончание: \1/' | sed 's/null/не завершена/'
echo "$LAST_SYNC" | sed 's/.*"campaigns_count":\([^,}]*\).*/Кампаний: \1/' | sed 's/null/0/'
echo "$LAST_SYNC" | sed 's/.*"rows_inserted":\([0-9]*\).*/Записей: \1/'
echo ""

echo "2️⃣ ДАННЫЕ В ТАБЛИЦЕ"
echo "----------------------------------------"

# Первая дата
FIRST_DATE=$(curl -k -s "${BASE_URL}/ozon_performance_daily?marketplace_id=eq.${MARKETPLACE_ID}&select=stat_date&order=stat_date.asc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null | grep -o '"stat_date":"[^"]*"' | cut -d'"' -f4)

# Последняя дата
LAST_DATE=$(curl -k -s "${BASE_URL}/ozon_performance_daily?marketplace_id=eq.${MARKETPLACE_ID}&select=stat_date&order=stat_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>/dev/null | grep -o '"stat_date":"[^"]*"' | cut -d'"' -f4)

if [ -n "$FIRST_DATE" ] && [ -n "$LAST_DATE" ]; then
  echo "Первая дата: $FIRST_DATE"
  echo "Последняя дата: $LAST_DATE"

  # Рассчитать разницу в днях
  DAYS=$((( $(date -d "$LAST_DATE" +%s) - $(date -d "$FIRST_DATE" +%s) ) / 86400 + 1))
  echo "Период: $DAYS дней"

  if [ $DAYS -ge 62 ]; then
    echo "✅ Данные за 62+ дня присутствуют"
  else
    echo "⚠️ Данных меньше 62 дней (нужно $((62 - DAYS)) дней)"
  fi
else
  echo "❌ Нет данных в таблице ozon_performance_daily"
fi
echo ""

echo "3️⃣ ПРОВЕРКА VIEW"
echo "----------------------------------------"
VIEW_CHECK=$(curl -k -s "${BASE_URL}/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>&1)

if echo "$VIEW_CHECK" | grep -q "does not exist"; then
  echo "❌ VIEW не существует"
elif echo "$VIEW_CHECK" | grep -q "\["; then
  echo "✅ VIEW существует и работает"
else
  echo "⚠️ Ошибка проверки VIEW"
fi
echo ""

echo "========================================"
echo "📋 РЕКОМЕНДАЦИИ:"
echo "========================================"

if echo "$LAST_SYNC" | grep -q "in_progress"; then
  echo "• Завершить зависшую синхронизацию"
fi

if [ -n "$DAYS" ] && [ $DAYS -lt 62 ]; then
  echo "• Запустить полную синхронизацию за 62 дня"
fi

if echo "$VIEW_CHECK" | grep -q "does not exist"; then
  echo "• Применить миграцию VIEW"
fi

echo ""
