#!/bin/bash
# Автоматический вызов delete_1k_drafted() через RPC API
# Удаляет все drafted replies вызывая функцию в цикле

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "Starting automatic cleanup via RPC..."
TOTAL=0
BATCH=0

while true; do
  BATCH=$((BATCH + 1))

  # Вызвать SQL функцию через RPC
  RESULT=$(curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/delete_1k_drafted" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -d '{}')

  DELETED=$(echo "$RESULT" | tr -d '\n\r ')

  # Если функция вернула 0 или пустоту, всё удалено
  if [ -z "$DELETED" ] || [ "$DELETED" = "0" ]; then
    echo "Batch $BATCH: No more drafted replies"
    break
  fi

  TOTAL=$((TOTAL + DELETED))
  echo "Batch $BATCH: deleted $DELETED (total: $TOTAL)"

  # Маленькая пауза
  sleep 0.5
done

echo "=========================================="
echo "DONE! Total deleted: $TOTAL"
echo "=========================================="

# Финальная проверка
echo "Final status:"
curl -s "$SUPABASE_URL/rest/v1/replies?deleted_at=is.null&select=status&limit=50000" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" | \
  jq -r '.[].status' | sort | uniq -c
