#!/bin/bash
# Добавление OZON API credentials и первый запуск синхронизации

set -e

source .env

SUPABASE_URL="${VITE_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"
CLIENT_ID="1172055"
API_KEY="6a584aee-c327-46a0-b46d-9aa7cdd92361"

echo "🔧 Настройка OZON API Credentials"
echo "================================"
echo ""

# Step 1: Add credentials
echo "Шаг 1: Добавление API credentials..."
RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/rest/v1/marketplace_api_credentials" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{
    \"marketplace_id\": \"${MARKETPLACE_ID}\",
    \"api_type\": \"seller\",
    \"client_id\": \"${CLIENT_ID}\",
    \"client_secret\": \"${API_KEY}\",
    \"is_active\": true
  }")

if echo "$RESPONSE" | jq -e '.id' > /dev/null 2>&1; then
  echo "✅ Credentials добавлены успешно!"
  CRED_ID=$(echo "$RESPONSE" | jq -r '.id')
  echo "   Credential ID: $CRED_ID"
else
  echo "⚠️  Возможно credentials уже существуют, обновляю..."
  # Try to update existing
  curl -s -X PATCH "${SUPABASE_URL}/rest/v1/marketplace_api_credentials?marketplace_id=eq.${MARKETPLACE_ID}&api_type=eq.seller" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"client_id\": \"${CLIENT_ID}\",
      \"client_secret\": \"${API_KEY}\",
      \"is_active\": true
    }" > /dev/null
  echo "✅ Credentials обновлены!"
fi

echo ""

# Step 2: Update marketplace sync_mode to 'api'
echo "Шаг 2: Переключение marketplace в режим API..."
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/marketplaces?id=eq.${MARKETPLACE_ID}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"sync_mode": "api"}' > /dev/null

echo "✅ Marketplace переключен в API режим!"
echo ""

# Step 3: Trigger first sync
echo "Шаг 3: Запуск первой синхронизации..."
echo ""

echo "📥 Синхронизация чатов..."
SYNC_CHATS=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/sync-chats-api" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"marketplace_id\": \"${MARKETPLACE_ID}\",
    \"client_id\": \"${CLIENT_ID}\",
    \"api_key\": \"${API_KEY}\"
  }")

if echo "$SYNC_CHATS" | jq -e '.success == true' > /dev/null 2>&1; then
  CHATS_COUNT=$(echo "$SYNC_CHATS" | jq -r '.chats_count // 0')
  MESSAGES_COUNT=$(echo "$SYNC_CHATS" | jq -r '.messages_count // 0')
  echo "✅ Чаты синхронизированы: $CHATS_COUNT чатов, $MESSAGES_COUNT сообщений"
else
  echo "⚠️  Ошибка синхронизации чатов:"
  echo "$SYNC_CHATS" | jq -r '.error // .message // "Unknown error"'
fi

echo ""

echo "📝 Синхронизация вопросов..."
SYNC_QUESTIONS=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/sync-questions-api" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"marketplace_id\": \"${MARKETPLACE_ID}\",
    \"client_id\": \"${CLIENT_ID}\",
    \"api_key\": \"${API_KEY}\"
  }")

if echo "$SYNC_QUESTIONS" | jq -e '.success == true' > /dev/null 2>&1; then
  QUESTIONS_COUNT=$(echo "$SYNC_QUESTIONS" | jq -r '.questions_count // 0')
  echo "✅ Вопросы синхронизированы: $QUESTIONS_COUNT"
else
  echo "⚠️  Ошибка синхронизации вопросов:"
  echo "$SYNC_QUESTIONS" | jq -r '.error // .message // "Unknown error"'
fi

echo ""

echo "⭐ Синхронизация отзывов..."
SYNC_REVIEWS=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/sync-reviews-api" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"marketplace_id\": \"${MARKETPLACE_ID}\",
    \"client_id\": \"${CLIENT_ID}\",
    \"api_key\": \"${API_KEY}\"
  }")

if echo "$SYNC_REVIEWS" | jq -e '.success == true' > /dev/null 2>&1; then
  REVIEWS_COUNT=$(echo "$SYNC_REVIEWS" | jq -r '.reviews_count // 0')
  echo "✅ Отзывы синхронизированы: $REVIEWS_COUNT"
else
  echo "⚠️  Ошибка синхронизации отзывов:"
  echo "$SYNC_REVIEWS" | jq -r '.error // .message // "Unknown error"'
fi

echo ""
echo "================================"
echo "✨ Настройка завершена!"
echo ""
echo "🔄 Запускаю финальную проверку..."
echo ""
