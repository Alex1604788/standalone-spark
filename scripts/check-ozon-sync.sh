#!/bin/bash
# Скрипт для проверки статуса OZON API синхронизации

set -e

# Load environment variables
source .env

SUPABASE_URL="${VITE_SUPABASE_URL}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

if [ -z "$SERVICE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY not found in .env"
  exit 1
fi

echo "🔍 Проверка OZON API Integration"
echo "================================"
echo ""

# Function to execute SQL via Supabase RPC
execute_sql() {
  local sql="$1"
  local output_file="/tmp/supabase_query_$$.json"

  curl -s -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"query\": $(echo "$sql" | jq -Rs .)}" \
    > "$output_file" 2>/dev/null || true

  # If RPC doesn't work, try direct table query
  if [ ! -s "$output_file" ] || grep -q "error" "$output_file"; then
    rm -f "$output_file"
    return 1
  fi

  cat "$output_file"
  rm -f "$output_file"
  return 0
}

# Check 1: OZON Marketplaces with credentials
echo "📊 Проверка #1: OZON Маркетплейсы и Credentials"
echo "------------------------------------------------"

curl -s "${SUPABASE_URL}/rest/v1/marketplaces?type=eq.ozon&select=id,name,sync_mode,last_chats_sync_at,last_questions_sync_at,last_reviews_sync_at" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" | jq -r '.[] | "
Marketplace: \(.name)
- ID: \(.id)
- Sync Mode: \(.sync_mode // "не установлен")
- Last Chats Sync: \(.last_chats_sync_at // "никогда")
- Last Questions Sync: \(.last_questions_sync_at // "никогда")
- Last Reviews Sync: \(.last_reviews_sync_at // "никогда")
"'

echo ""

# Check credentials
echo "🔑 Credentials Status:"
CREDS=$(curl -s "${SUPABASE_URL}/rest/v1/marketplace_api_credentials?api_type=eq.seller&select=marketplace_id,is_active,client_id" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

if echo "$CREDS" | jq -e '. | length > 0' > /dev/null 2>&1; then
  echo "$CREDS" | jq -r '.[] | "✅ Marketplace \(.marketplace_id): active=\(.is_active), client_id=\(.client_id[0:20])..."'
else
  echo "❌ Нет API credentials для OZON"
fi

echo ""
echo ""

# Check 2: Chats statistics
echo "💬 Проверка #2: Статистика Чатов"
echo "------------------------------------------------"

CHATS=$(curl -s "${SUPABASE_URL}/rest/v1/chats?select=id,status,unread_count,updated_at" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}")

TOTAL=$(echo "$CHATS" | jq '. | length')
ACTIVE=$(echo "$CHATS" | jq '[.[] | select(.status == "active")] | length')
UNREAD=$(echo "$CHATS" | jq '[.[] | select(.unread_count > 0)] | length')

echo "Всего чатов: $TOTAL"
echo "Активных: $ACTIVE"
echo "С непрочитанными: $UNREAD"

if [ "$TOTAL" -gt 0 ]; then
  echo ""
  echo "📝 Последние 5 чатов:"
  echo "$CHATS" | jq -r 'sort_by(.updated_at) | reverse | .[:5] | .[] | "- Chat \(.id[0:8])... | Status: \(.status) | Unread: \(.unread_count) | Updated: \(.updated_at)"'
fi

echo ""
echo ""

# Check 3: Check if tables exist
echo "🗄️  Проверка #3: Структура БД"
echo "------------------------------------------------"

TABLES=$(curl -s "${SUPABASE_URL}/rest/v1/chats?select=id&limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" 2>&1)

if echo "$TABLES" | grep -q "relation.*does not exist"; then
  echo "❌ Таблица 'chats' не существует! Нужно применить миграции."
else
  echo "✅ Таблица 'chats' существует"
fi

MESSAGES=$(curl -s "${SUPABASE_URL}/rest/v1/chat_messages?select=id&limit=1" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" 2>&1)

if echo "$MESSAGES" | grep -q "relation.*does not exist"; then
  echo "❌ Таблица 'chat_messages' не существует! Нужно применить миграции."
else
  echo "✅ Таблица 'chat_messages' существует"

  MSG_COUNT=$(curl -s "${SUPABASE_URL}/rest/v1/chat_messages?select=id" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Prefer: count=exact" \
    -I 2>/dev/null | grep -i "content-range" | awk '{print $2}' | cut -d'/' -f2 || echo "0")
  echo "   Сообщений в БД: $MSG_COUNT"
fi

echo ""
echo ""

# Check 4: Edge Functions
echo "⚡ Проверка #4: Edge Functions"
echo "------------------------------------------------"

echo "Проверяю доступность Edge Functions..."

for func in "sync-chats-api" "sync-questions-api" "sync-reviews-api" "send-chat-message" "send-chat-file"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/functions/v1/${func}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}' 2>/dev/null)

  if [ "$STATUS" = "400" ] || [ "$STATUS" = "404" ] || [ "$STATUS" = "200" ]; then
    echo "✅ $func - доступна (HTTP $STATUS)"
  else
    echo "❌ $func - недоступна (HTTP $STATUS)"
  fi
done

echo ""
echo ""
echo "================================"
echo "✨ Проверка завершена!"
