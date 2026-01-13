#!/bin/bash
set -e

source .env.local

echo "🚀 Запуск синхронизации OZON Performance (daily)"
echo "================================================"
echo ""

# Запуск через RPC
RESPONSE=$(curl -k -s -X POST \
  "${SUPABASE_URL}/rest/v1/rpc/trigger_ozon_performance_sync" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"p_marketplace_id":"84b1d0f5-6750-407c-9b04-28c051972162","p_sync_period":"daily"}')

echo "Ответ: $RESPONSE"
echo ""

if echo "$RESPONSE" | grep -q "error"; then
  echo "❌ Ошибка при запуске синхронизации"
  echo "$RESPONSE"
  exit 1
else
  echo "✅ Синхронизация запущена"
  echo ""
  echo "Подождите 10-15 минут и проверьте результат"
fi
