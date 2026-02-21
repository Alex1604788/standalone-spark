#!/bin/bash

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNjc4MDA0OCwiZXhwIjoyMDUyMzU2MDQ4fQ.MWRgS6SokdXqLZtdgjVv2g4jKyYATCGTnTmPbK1nrq8"

echo "🧪 Быстрый тест функций..."
echo ""

# Test cleanup function via RPC
echo "1. Тест cleanup_old_reviews через RPC:"
curl -s "${SUPABASE_URL}/rest/v1/rpc/cleanup_old_reviews" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  --data '{"days_threshold": 9999}' | jq '.' 2>/dev/null || echo "Функция работает (или нет jq)"

echo ""
echo "2. Проверка edge function publish-reply:"
curl -s -X POST "${SUPABASE_URL}/functions/v1/publish-reply" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  --data '{}' | head -20

