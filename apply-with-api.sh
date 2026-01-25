#!/bin/bash

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"
ACCESS_TOKEN="sbp_b1dd02375b0420df4c3f9b6ddfd49f7e58737ad6"
PROJECT_REF="bkmicyguzlwampuindff"

echo "========================================"
echo "ПРИМЕНЕНИЕ МИГРАЦИЙ ЧЕРЕЗ SUPABASE API"
echo "========================================"

# Объединяем все миграции в один файл
cat /home/user/standalone-spark/COMBINED_CLEANUP_MIGRATIONS.sql > /tmp/migrations_to_apply.sql

# Пробуем выполнить через Management API
echo ""
echo "📝 Выполняю миграции через Management API..."

curl -X POST \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg sql "$(cat /tmp/migrations_to_apply.sql)" '{query: $sql}')" \
  -v

echo ""
echo "========================================"
