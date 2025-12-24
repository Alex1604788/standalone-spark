#!/bin/bash

echo "Синхронизация OZON Performance для периода 21-24.12.2025..."
echo "Marketplace ID: 84b1d0f5-6750-407c-9b04-28c051972162"
echo ""

# Получаем URL Supabase из переменных окружения или используем локальный
SUPABASE_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY}"

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ ОШИБКА: SUPABASE_ANON_KEY не установлен"
    echo "Установите переменную окружения или укажите anon key"
    exit 1
fi

curl -i -X POST "${SUPABASE_URL}/functions/v1/sync-ozon-performance" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "marketplace_id": "84b1d0f5-6750-407c-9b04-28c051972162",
    "start_date": "2025-12-21",
    "end_date": "2025-12-24"
  }'

echo ""
echo "Готово! Проверь результат выше."
