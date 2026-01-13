#!/bin/bash
source .env.local

echo "🔐 ТЕСТИРОВАНИЕ ПОЛУЧЕНИЯ OZON TOKEN"
echo "========================================"
echo ""

# Получаем credentials из базы
echo "1. Получение credentials из базы..."
CREDS=$(curl -k -s "${SUPABASE_URL}/rest/v1/marketplace_api_credentials?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&api_type=eq.performance" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

CLIENT_ID=$(echo "$CREDS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['client_id'] if len(d)>0 else '')" 2>/dev/null)
CLIENT_SECRET=$(echo "$CREDS" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d[0]['client_secret'] if len(d)>0 else '')" 2>/dev/null)

if [ -z "$CLIENT_ID" ]; then
  echo "❌ Не удалось получить credentials из базы"
  echo "Ответ:"
  echo "$CREDS"
  exit 1
fi

echo "✅ Credentials получены"
echo "Client ID: ${CLIENT_ID:0:15}..."
echo "Client Secret: ***"
echo ""

# Тестируем получение токена
echo "2. Запрос токена у OZON API..."
echo "URL: https://api-performance.ozon.ru/api/client/token"
echo ""

TOKEN_RESPONSE=$(curl -k -s -w "\nHTTP_CODE:%{http_code}" -X POST \
  "https://api-performance.ozon.ru/api/client/token" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"client_id\": \"$CLIENT_ID\",
    \"client_secret\": \"$CLIENT_SECRET\",
    \"grant_type\": \"client_credentials\"
  }")

HTTP_CODE=$(echo "$TOKEN_RESPONSE" | grep "HTTP_CODE:" | cut -d':' -f2)
BODY=$(echo "$TOKEN_RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Code: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Токен получен успешно!"
  echo "$BODY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(f'Access Token: {d.get(\"access_token\", \"\")[:30]}...')
    print(f'Token Type: {d.get(\"token_type\", \"\")}')
    print(f'Expires In: {d.get(\"expires_in\", \"\")} секунд')
except Exception as e:
    print(f'Ошибка парсинга: {e}')
    print(sys.stdin.read())
" 2>/dev/null
else
  echo "❌ Ошибка получения токена"
  echo ""
  echo "Ответ OZON API:"
  echo "$BODY" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(json.dumps(d, indent=2, ensure_ascii=False))
except:
    print(sys.stdin.read())
" 2>/dev/null || echo "$BODY"

  echo ""
  echo "========================================"
  echo "📋 ДИАГНОСТИКА:"
  echo "========================================"

  if echo "$BODY" | grep -qi "invalid_client"; then
    echo "❌ OZON API отклоняет Client ID/Secret"
    echo ""
    echo "Возможные причины:"
    echo "1. Client ID или Client Secret неверные"
    echo "2. Credentials истекли или были отозваны в OZON"
    echo "3. IP адрес не в белом списке (если настроен)"
    echo ""
    echo "Решение:"
    echo "1. Перейдите на https://performance.ozon.ru/api"
    echo "2. Создайте новый Client ID и Secret"
    echo "3. Обновите через UI: /app/settings/ozon → кнопка 'Сохранить'"
  elif echo "$BODY" | grep -qi "authentication failed"; then
    echo "❌ Ошибка аутентификации"
    echo ""
    echo "Client ID и Secret не совпадают."
    echo "Проверьте что вы скопировали полностью оба значения."
  else
    echo "⚠️ Неизвестная ошибка OZON API"
  fi
fi

echo ""
echo "========================================"
