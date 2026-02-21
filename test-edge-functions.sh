#!/bin/bash

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3ODAwNDgsImV4cCI6MjA1MjM1NjA0OH0.vkMzG1QOWxKQP_JUlwKSNLsOPPc_jTkkUcVG0DlPF6k"

echo "🧪 Тестирование Edge Functions"
echo "================================"
echo ""

FUNCTIONS=(
  "auto-generate-drafts-cron"
  "auto-generate-drafts"
  "process-scheduled-replies"
  "publish-reply"
  "sync-ozon"
)

for func in "${FUNCTIONS[@]}"; do
  echo "📦 Testing: ${func}"
  echo "-----------------------------------"
  
  RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/functions/v1/${func}" \
    -H "Authorization: Bearer ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    --data '{}' 2>&1)
  
  # Check if response contains error or success
  if echo "$RESPONSE" | grep -qi "error\|invalid\|not found"; then
    echo "❌ Error: $RESPONSE" | head -3
  elif echo "$RESPONSE" | grep -qi "success\|message\|result"; then
    echo "✅ Working: $RESPONSE" | head -3
  else
    echo "⚠️  Response: $RESPONSE" | head -3
  fi
  
  echo ""
done

echo "================================"
echo "✅ Тестирование завершено"

