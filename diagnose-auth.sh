#!/bin/bash
source .env.local

echo "🔍 ДИАГНОСТИКА ПРОБЛЕМЫ С АВТОРИЗАЦИЕЙ"
echo "========================================"
echo ""

# 1. Проверка API credentials
echo "1. API CREDENTIALS В БАЗЕ:"
echo "----------------------------------------"
CREDS=$(curl -k -s "${SUPABASE_URL}/rest/v1/marketplace_api_credentials?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>&1)

if echo "$CREDS" | grep -q "client_id"; then
  echo "✅ API credentials найдены"
  echo "$CREDS" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'Client ID: {d.get(\"client_id\", \"не указан\")[:20]}...')
    print(f'Client Secret: {\"***\" if d.get(\"client_secret\") else \"отсутствует\"}')
    print(f'Обновлено: {d.get(\"updated_at\", \"не указано\")[:19]}')
except Exception as e:
    print(f'Ошибка: {e}')
" 2>/dev/null
else
  echo "❌ API credentials не найдены или ошибка"
  echo "$CREDS" | head -5
fi
echo ""

# 2. Проверка маркетплейса
echo "2. НАСТРОЙКИ МАРКЕТПЛЕЙСА:"
echo "----------------------------------------"
MARKETPLACE=$(curl -k -s "${SUPABASE_URL}/rest/v1/marketplaces?id=eq.84b1d0f5-6750-407c-9b04-28c051972162" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" 2>&1)

if echo "$MARKETPLACE" | grep -q "marketplace_name"; then
  echo "✅ Маркетплейс найден"
  echo "$MARKETPLACE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'Название: {d.get(\"marketplace_name\")}')
    print(f'Активен: {d.get(\"is_active\")}')
except:
    pass
" 2>/dev/null
else
  echo "❌ Маркетплейс не найден"
fi
echo ""

# 3. Попытка запуска синхронизации и анализ ошибки
echo "3. ТЕСТОВЫЙ ЗАПУСК СИНХРОНИЗАЦИИ:"
echo "----------------------------------------"
SYNC_RESPONSE=$(curl -k -s -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/sync-ozon-performance" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"marketplace_id":"84b1d0f5-6750-407c-9b04-28c051972162","sync_period":"daily"}' 2>&1)

echo "Ответ Edge Function:"
echo "$SYNC_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(json.dumps(d, indent=2, ensure_ascii=False))
except:
    print(sys.stdin.read())
" 2>/dev/null || echo "$SYNC_RESPONSE"
echo ""

# 4. Анализ проблемы
echo "========================================"
echo "📋 АНАЛИЗ:"
echo "========================================"

if echo "$SYNC_RESPONSE" | grep -q "Failed to obtain access token"; then
  echo "❌ Проблема: Edge Function не может получить access token от OZON"
  echo ""
  echo "Возможные причины:"
  echo "1. Неверный Client ID или Client Secret"
  echo "2. Client Secret истёк или был отозван в OZON"
  echo "3. Неправильный URL для получения токена"
  echo ""
  echo "Решение:"
  echo "1. Проверьте Client ID и Secret на https://performance.ozon.ru/api"
  echo "2. Обновите credentials в таблице marketplace_api_credentials"
  echo "3. Или обновите через UI на /app/settings/ozon"
elif echo "$SYNC_RESPONSE" | grep -q "invalid_client"; then
  echo "❌ Проблема: OZON API отклоняет Client ID/Secret"
  echo ""
  echo "Решение:"
  echo "1. Получите новый Client ID и Secret на https://performance.ozon.ru/api"
  echo "2. Обновите credentials через UI: /app/settings/ozon"
else
  echo "⚠️ Неизвестная ошибка"
fi

echo ""
