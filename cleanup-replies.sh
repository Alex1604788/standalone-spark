#!/bin/bash

# =========================================================
# СКРИПТ ДЛЯ ОЧИСТКИ СТАРЫХ ЗАПИСЕЙ ИЗ ТАБЛИЦЫ REPLIES
# Агрессивная стратегия: удаляем ВСЕ записи старше 30 дней
# =========================================================

source .env

echo "🧹 ОЧИСТКА СТАРЫХ ЗАПИСЕЙ ИЗ ТАБЛИЦЫ REPLIES"
echo "================================================================================"
echo ""

API_URL="${VITE_SUPABASE_URL}/rest/v1"
API_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Дата отсечки: 30 дней назад
CUTOFF_DATE=$(date -u -d "30 days ago" -Iseconds)

echo "📅 Дата отсечки: ${CUTOFF_DATE}"
echo "⚠️  Будут удалены ВСЕ записи старше 30 дней (включая published)"
echo ""

# Функция для получения количества записей
get_count() {
  local query="$1"
  curl -s "${API_URL}/replies?select=id${query}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Prefer: count=exact" \
    -I | grep -i "content-range:" | grep -o '[0-9]*$' | tr -d '\r\n'
}

# 1. Проверяем что будет удалено
echo "🔍 АНАЛИЗ: Что будет удалено?"
echo "--------------------------------------------------------------------------------"

FAILED_TO_DELETE=$(get_count "&status=eq.failed&created_at=lt.${CUTOFF_DATE}")
DRAFTED_TO_DELETE=$(get_count "&status=eq.drafted&created_at=lt.${CUTOFF_DATE}")
PUBLISHED_TO_DELETE=$(get_count "&status=eq.published&created_at=lt.${CUTOFF_DATE}")

TOTAL_TO_DELETE=$((FAILED_TO_DELETE + DRAFTED_TO_DELETE + PUBLISHED_TO_DELETE))

printf "%-12s | %8s\n" "Status" "Удалить"
echo "-------------|----------"
printf "%-12s | %8s\n" "failed" "$FAILED_TO_DELETE"
printf "%-12s | %8s\n" "drafted" "$DRAFTED_TO_DELETE"
printf "%-12s | %8s\n" "published" "$PUBLISHED_TO_DELETE"
echo "-------------|----------"
printf "%-12s | %8s\n" "ИТОГО" "$TOTAL_TO_DELETE"
echo ""

# Если нечего удалять
if [ "$TOTAL_TO_DELETE" -eq 0 ]; then
  echo "✅ Нет записей для удаления!"
  echo "   Все записи младше 30 дней."
  echo ""
  exit 0
fi

# 2. Запрашиваем подтверждение
echo "⚠️  ВНИМАНИЕ!"
echo "   Вы собираетесь БЕЗВОЗВРАТНО удалить ${TOTAL_TO_DELETE} записей!"
echo "   Это действие НЕЛЬЗЯ отменить!"
echo ""
read -p "Продолжить? (введите YES для подтверждения): " CONFIRMATION

if [ "$CONFIRMATION" != "YES" ]; then
  echo ""
  echo "❌ Очистка отменена пользователем."
  echo ""
  exit 1
fi

echo ""
echo "🚀 НАЧИНАЕМ ОЧИСТКУ..."
echo "--------------------------------------------------------------------------------"

# 3. Удаляем failed записи
if [ "$FAILED_TO_DELETE" -gt 0 ]; then
  echo "🗑️  Удаляем ${FAILED_TO_DELETE} failed записей..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "${API_URL}/replies?status=eq.failed&created_at=lt.${CUTOFF_DATE}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Prefer: return=minimal")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" -eq 204 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo "   ✅ Failed записи удалены"
  else
    echo "   ❌ Ошибка при удалении failed записей (HTTP $HTTP_CODE)"
    echo "$RESPONSE" | head -n -1
  fi
fi

# 4. Удаляем drafted записи
if [ "$DRAFTED_TO_DELETE" -gt 0 ]; then
  echo "🗑️  Удаляем ${DRAFTED_TO_DELETE} drafted записей..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "${API_URL}/replies?status=eq.drafted&created_at=lt.${CUTOFF_DATE}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Prefer: return=minimal")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" -eq 204 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo "   ✅ Drafted записи удалены"
  else
    echo "   ❌ Ошибка при удалении drafted записей (HTTP $HTTP_CODE)"
    echo "$RESPONSE" | head -n -1
  fi
fi

# 5. Удаляем published записи
if [ "$PUBLISHED_TO_DELETE" -gt 0 ]; then
  echo "🗑️  Удаляем ${PUBLISHED_TO_DELETE} published записей..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE \
    "${API_URL}/replies?status=eq.published&created_at=lt.${CUTOFF_DATE}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Prefer: return=minimal")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)

  if [ "$HTTP_CODE" -eq 204 ] || [ "$HTTP_CODE" -eq 200 ]; then
    echo "   ✅ Published записи удалены"
  else
    echo "   ❌ Ошибка при удалении published записей (HTTP $HTTP_CODE)"
    echo "$RESPONSE" | head -n -1
  fi
fi

echo ""
echo "================================================================================"
echo "✅ ОЧИСТКА ЗАВЕРШЕНА!"
echo "================================================================================"
echo ""
echo "📊 РЕЗУЛЬТАТ:"
echo "   • Удалено failed записей: ${FAILED_TO_DELETE}"
echo "   • Удалено drafted записей: ${DRAFTED_TO_DELETE}"
echo "   • Удалено published записей: ${PUBLISHED_TO_DELETE}"
echo "   • Всего удалено: ${TOTAL_TO_DELETE}"
echo ""
echo "💡 РЕКОМЕНДАЦИЯ:"
echo "   Выполните VACUUM для освобождения места:"
echo "   В Supabase SQL Editor выполните: VACUUM FULL replies;"
echo ""
echo "🔄 Для автоматической очистки настройте pg_cron или cron job"
echo "   (см. инструкции в CREATE_CLEANUP_FUNCTION.sql)"
echo ""
