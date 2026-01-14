#!/bin/bash
# Скрипт для выполнения SQL через Supabase

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "🚀 Применяем VIEW через Supabase..."

# Читаем SQL файл
SQL_CONTENT=$(cat VIEW_TO_APPLY.sql)

# Пытаемся выполнить через Supabase Edge Function
curl -X POST "${SUPABASE_URL}/functions/v1/exec-sql" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"sql\": $(jq -Rs . < VIEW_TO_APPLY.sql)}" \
  --max-time 30 \
  -v

echo ""
echo "✅ Запрос отправлен"
