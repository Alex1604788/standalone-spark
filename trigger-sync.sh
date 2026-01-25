#!/bin/bash
set -e

source .env.local

echo "🚀 Запуск синхронизации через Edge Function"
echo "=============================================="
echo ""

RESPONSE=$(curl -k -s -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/sync-ozon-performance" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"marketplace_id":"84b1d0f5-6750-407c-9b04-28c051972162","sync_period":"daily"}')

echo "Ответ:"
echo "$RESPONSE"
echo ""

if echo "$RESPONSE" | grep -qi "error\|failed"; then
  echo "⚠️ Возможна ошибка, проверьте ответ выше"
else
  echo "✅ Запрос отправлен"
fi

echo ""
echo "Проверка через 5 секунд..."
sleep 5

echo ""
echo "📊 Последняя синхронизация:"
curl -k -s "${SUPABASE_URL}/rest/v1/ozon_sync_history?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&order=started_at.desc&limit=1&select=status,started_at,error_message" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'Статус: {d[\"status\"]}')
    print(f'Начало: {d[\"started_at\"][:19]}')
    if d.get('error_message'):
        print(f'Ошибка: {d[\"error_message\"][:80]}')
except Exception as e:
    print(f'Ошибка: {e}')
"
