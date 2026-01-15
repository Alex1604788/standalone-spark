#!/bin/bash
# Параллельное удаление drafted replies
# Запускает 10 процессов одновременно для быстрого удаления

SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

delete_batch() {
  local worker_id=$1
  local total=0

  while true; do
    # Получить 500 IDs
    IDS=$(curl -s "$SUPABASE_URL/rest/v1/replies?status=eq.drafted&deleted_at=is.null&select=id&limit=500" \
      -H "apikey: $SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" | \
      jq -r '.[].id' | head -500)

    if [ -z "$IDS" ]; then
      echo "Worker $worker_id: No more records"
      break
    fi

    COUNT=$(echo "$IDS" | wc -l)

    # Удалить по одному ID за раз (чтобы не было Bad Request)
    for id in $IDS; do
      curl -s -X DELETE "$SUPABASE_URL/rest/v1/replies?id=eq.$id" \
        -H "apikey: $SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" >/dev/null 2>&1
    done

    total=$((total + COUNT))
    echo "Worker $worker_id: deleted $COUNT (total: $total)"

    sleep 0.1
  done

  echo "Worker $worker_id DONE: $total deleted"
}

echo "Starting parallel deletion with 10 workers..."

# Запустить 10 параллельных процессов
for i in {1..10}; do
  delete_batch $i &
done

# Ждать завершения всех процессов
wait

echo "=========================================="
echo "All workers completed!"
echo "=========================================="
