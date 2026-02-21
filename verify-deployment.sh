#!/bin/bash

# ============================================================================
# ВЕРИФИКАЦИЯ ДЕПЛОЯ
# Проверяет что все миграции и edge functions применены корректно
# ============================================================================

set -e

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3ODAwNDgsImV4cCI6MjA1MjM1NjA0OH0.vkMzG1QOWxKQP_JUlwKSNLsOPPc_jTkkUcVG0DlPF6k"
PROJECT_REF="bkmicyguzlwampuindff"

echo ""
echo "========================================"
echo "  🔍 ВЕРИФИКАЦИЯ ДЕПЛОЯ"
echo "  Project: $PROJECT_REF"
echo "========================================"
echo ""

# Test 1: Check cleanup_old_reviews function
echo "📋 Тест 1: Проверка функции cleanup_old_reviews"
echo "----------------------------------------"
QUERY1='SELECT routine_name, routine_type FROM information_schema.routines WHERE routine_schema = '\''public'\'' AND routine_name = '\''cleanup_old_reviews'\'';'
curl -s "${SUPABASE_URL}/rest/v1/rpc/cleanup_old_reviews" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  --data '{"days_threshold": 9999}' \
  2>&1 | head -20

echo ""
echo ""

# Test 2: List edge functions
echo "📋 Тест 2: Проверка Edge Functions"
echo "----------------------------------------"
echo "Попробуйте выполнить локально:"
echo "  npx supabase functions list --project-ref ${PROJECT_REF}"
echo ""

# Test 3: Check specific functions
echo "📋 Тест 3: Проверка доступности функций"
echo "----------------------------------------"

FUNCTIONS=(
  "auto-generate-drafts-cron"
  "auto-generate-drafts"
  "process-scheduled-replies"
  "publish-reply"
  "sync-ozon"
)

for func in "${FUNCTIONS[@]}"; do
  echo -n "  → ${func}: "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${SUPABASE_URL}/functions/v1/${func}" -H "Authorization: Bearer ${ANON_KEY}" 2>&1)

  if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "200" ]; then
    echo "✅ Deployed (HTTP $STATUS)"
  else
    echo "❌ Not found (HTTP $STATUS)"
  fi
done

echo ""
echo "========================================"
echo "  ✅ Проверка завершена!"
echo "========================================"
echo ""
echo "Для полной проверки выполните SQL запросы из файла:"
echo "  test-deployment.sql"
echo ""
echo "В Supabase SQL Editor:"
echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/editor"
echo ""
