#!/bin/bash

# Загружаем переменные окружения
source .env

echo "🔍 ПОЛНЫЙ АНАЛИЗ ТАБЛИЦЫ REPLIES"
echo "================================================================================"
echo ""

API_URL="${VITE_SUPABASE_URL}/rest/v1"
API_KEY="${SUPABASE_SERVICE_ROLE_KEY}"

# Получаем ВСЕ записи
echo "📡 Загружаем данные из базы..."
ALL_DATA=$(curl -s "${API_URL}/replies?select=id,status,created_at,published_at,content" \
  -H "apikey: ${API_KEY}" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "Prefer: return=representation")

echo "✅ Данные загружены!"
echo ""

# 1. Общая статистика
echo "📊 1. ОБЩАЯ СТАТИСТИКА"
echo "--------------------------------------------------------------------------------"

TOTAL_COUNT=$(echo "$ALL_DATA" | jq 'length')
OLDEST=$(echo "$ALL_DATA" | jq -r 'sort_by(.created_at) | .[0].created_at' | cut -d'T' -f1)
NEWEST=$(echo "$ALL_DATA" | jq -r 'sort_by(.created_at) | .[-1].created_at' | cut -d'T' -f1)

# Вычисляем размер контента
TOTAL_SIZE=$(echo "$ALL_DATA" | jq '[.[] | .content | length] | add')
TOTAL_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $TOTAL_SIZE / 1024 / 1024}")

echo "Всего записей: ${TOTAL_COUNT}"
echo "Самая старая запись: ${OLDEST}"
echo "Самая новая запись: ${NEWEST}"
echo "Размер контента: ${TOTAL_SIZE_MB} MB"
echo ""

# 2. Распределение по статусам
echo "📈 2. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ"
echo "--------------------------------------------------------------------------------"

DRAFTED_COUNT=$(echo "$ALL_DATA" | jq '[.[] | select(.status == "drafted")] | length')
PUBLISHED_COUNT=$(echo "$ALL_DATA" | jq '[.[] | select(.status == "published")] | length')
FAILED_COUNT=$(echo "$ALL_DATA" | jq '[.[] | select(.status == "failed")] | length')

DRAFTED_PCT=$(awk "BEGIN {printf \"%.1f\", ($DRAFTED_COUNT / $TOTAL_COUNT) * 100}")
PUBLISHED_PCT=$(awk "BEGIN {printf \"%.1f\", ($PUBLISHED_COUNT / $TOTAL_COUNT) * 100}")
FAILED_PCT=$(awk "BEGIN {printf \"%.1f\", ($FAILED_COUNT / $TOTAL_COUNT) * 100}")

printf "%-12s | %8s | %8s%%\n" "Status" "Count" "Percent"
echo "-------------|----------|----------"
printf "%-12s | %8s | %8s%%\n" "drafted" "$DRAFTED_COUNT" "$DRAFTED_PCT"
printf "%-12s | %8s | %8s%%\n" "published" "$PUBLISHED_COUNT" "$PUBLISHED_PCT"
printf "%-12s | %8s | %8s%%\n" "failed" "$FAILED_COUNT" "$FAILED_PCT"
echo ""

# 3. Старые записи > 90 дней
echo "🗓️  3. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)"
echo "--------------------------------------------------------------------------------"

DATE_90=$(date -u -d "90 days ago" -Iseconds)

OLD_90_DRAFTED=$(echo "$ALL_DATA" | jq --arg date "$DATE_90" '[.[] | select(.status == "drafted" and .created_at < $date)] | length')
OLD_90_PUBLISHED=$(echo "$ALL_DATA" | jq --arg date "$DATE_90" '[.[] | select(.status == "published" and .created_at < $date)] | length')
OLD_90_FAILED=$(echo "$ALL_DATA" | jq --arg date "$DATE_90" '[.[] | select(.status == "failed" and .created_at < $date)] | length')

printf "%-12s | %16s\n" "Status" "Count > 90 дней"
echo "-------------|------------------"
printf "%-12s | %16s\n" "drafted" "$OLD_90_DRAFTED"
printf "%-12s | %16s\n" "published" "$OLD_90_PUBLISHED"
printf "%-12s | %16s\n" "failed" "$OLD_90_FAILED"
echo ""

# 4. Очень старые записи > 180 дней
echo "📅 4. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)"
echo "--------------------------------------------------------------------------------"

DATE_180=$(date -u -d "180 days ago" -Iseconds)

OLD_180_DRAFTED=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "drafted" and .created_at < $date)] | length')
OLD_180_PUBLISHED=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "published" and .created_at < $date)] | length')
OLD_180_FAILED=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "failed" and .created_at < $date)] | length')

printf "%-12s | %18s\n" "Status" "Count > 180 дней"
echo "-------------|--------------------"
printf "%-12s | %18s\n" "drafted" "$OLD_180_DRAFTED"
printf "%-12s | %18s\n" "published" "$OLD_180_PUBLISHED"
printf "%-12s | %18s\n" "failed" "$OLD_180_FAILED"
echo ""

# 5. Failed записи по периодам
echo "❌ 5. FAILED ЗАПИСИ ПО ПЕРИОДАМ"
echo "--------------------------------------------------------------------------------"

DATE_7=$(date -u -d "7 days ago" -Iseconds)
DATE_30=$(date -u -d "30 days ago" -Iseconds)

FAILED_7=$(echo "$ALL_DATA" | jq --arg date "$DATE_7" '[.[] | select(.status == "failed" and .created_at >= $date)] | length')
FAILED_7_30=$(echo "$ALL_DATA" | jq --arg date7 "$DATE_7" --arg date30 "$DATE_30" '[.[] | select(.status == "failed" and .created_at < $date7 and .created_at >= $date30)] | length')
FAILED_30_90=$(echo "$ALL_DATA" | jq --arg date30 "$DATE_30" --arg date90 "$DATE_90" '[.[] | select(.status == "failed" and .created_at < $date30 and .created_at >= $date90)] | length')
FAILED_90_180=$(echo "$ALL_DATA" | jq --arg date90 "$DATE_90" --arg date180 "$DATE_180" '[.[] | select(.status == "failed" and .created_at < $date90 and .created_at >= $date180)] | length')
FAILED_180=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "failed" and .created_at < $date)] | length')

printf "%-18s | %8s\n" "Период" "Count"
echo "-------------------|----------"
printf "%-18s | %8s\n" "< 7 дней" "$FAILED_7"
printf "%-18s | %8s\n" "7-30 дней" "$FAILED_7_30"
printf "%-18s | %8s\n" "30-90 дней" "$FAILED_30_90"
printf "%-18s | %8s\n" "90-180 дней" "$FAILED_90_180"
printf "%-18s | %8s\n" "> 180 дней" "$FAILED_180"
echo ""

# 6. Потенциал очистки
echo "🧹 6. ПОТЕНЦИАЛ ОЧИСТКИ"
echo "================================================================================"

CLEAN_FAILED_30=$(echo "$ALL_DATA" | jq --arg date "$DATE_30" '[.[] | select(.status == "failed" and .created_at < $date)] | length')
CLEAN_DRAFTED_90=$(echo "$ALL_DATA" | jq --arg date "$DATE_90" '[.[] | select(.status == "drafted" and .created_at < $date)] | length')
CLEAN_PUBLISHED_180=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "published" and .created_at < $date)] | length')

# Размеры контента для удаления
FAILED_30_SIZE=$(echo "$ALL_DATA" | jq --arg date "$DATE_30" '[.[] | select(.status == "failed" and .created_at < $date) | .content | length] | add // 0')
DRAFTED_90_SIZE=$(echo "$ALL_DATA" | jq --arg date "$DATE_90" '[.[] | select(.status == "drafted" and .created_at < $date) | .content | length] | add // 0')
PUBLISHED_180_SIZE=$(echo "$ALL_DATA" | jq --arg date "$DATE_180" '[.[] | select(.status == "published" and .created_at < $date) | .content | length] | add // 0')

FAILED_30_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $FAILED_30_SIZE / 1024 / 1024}")
DRAFTED_90_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $DRAFTED_90_SIZE / 1024 / 1024}")
PUBLISHED_180_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $PUBLISHED_180_SIZE / 1024 / 1024}")

echo ""
echo "🔥 ВЫСОКИЙ ПРИОРИТЕТ:"
printf "   Failed > 30 дней: %s записей (%.2f MB)\n" "$CLEAN_FAILED_30" "$FAILED_30_SIZE_MB"
echo ""
echo "⚠️  СРЕДНИЙ ПРИОРИТЕТ:"
printf "   Drafted > 90 дней: %s записей (%.2f MB)\n" "$CLEAN_DRAFTED_90" "$DRAFTED_90_SIZE_MB"
echo ""
echo "💤 НИЗКИЙ ПРИОРИТЕТ:"
printf "   Published > 180 дней: %s записей (%.2f MB)\n" "$CLEAN_PUBLISHED_180" "$PUBLISHED_180_SIZE_MB"
echo ""

# Рекомендации
echo "================================================================================"
echo "💡 РЕКОМЕНДАЦИИ И СТРАТЕГИЯ ОЧИСТКИ"
echo "================================================================================"
echo ""

TOTAL_CLEANABLE=$((CLEAN_FAILED_30 + CLEAN_DRAFTED_90 + CLEAN_PUBLISHED_180))
TOTAL_SIZE_CLEANABLE=$(awk "BEGIN {printf \"%.2f\", ($FAILED_30_SIZE + $DRAFTED_90_SIZE + $PUBLISHED_180_SIZE) / 1024 / 1024}")

if [ "$TOTAL_CLEANABLE" -gt 0 ]; then
  echo "📋 ПРЕДЛАГАЕМАЯ СТРАТЕГИЯ:"
  echo ""

  if [ "$CLEAN_FAILED_30" -gt 0 ]; then
    echo "1️⃣  УДАЛИТЬ ${CLEAN_FAILED_30} failed записей старше 30 дней"
    echo "   📌 Причина: Эти записи не были опубликованы, вероятно содержат ошибки"
    echo "   💾 Освободим: ${FAILED_30_SIZE_MB} MB"
    echo "   🎯 Приоритет: ВЫСОКИЙ"
    echo "   ✅ Рекомендация: УДАЛИТЬ БЕЗ СОМНЕНИЙ"
    echo ""
  fi

  if [ "$CLEAN_DRAFTED_90" -gt 0 ]; then
    echo "2️⃣  УДАЛИТЬ ${CLEAN_DRAFTED_90} drafted записей старше 90 дней"
    echo "   📌 Причина: Черновики, которые не были опубликованы 3 месяца"
    echo "   💾 Освободим: ${DRAFTED_90_SIZE_MB} MB"
    echo "   🎯 Приоритет: СРЕДНИЙ"
    echo "   ✅ Рекомендация: УДАЛИТЬ (старые неиспользованные черновики)"
    echo ""
  fi

  if [ "$CLEAN_PUBLISHED_180" -gt 0 ]; then
    echo "3️⃣  РАССМОТРЕТЬ ${CLEAN_PUBLISHED_180} published записей старше 180 дней"
    echo "   📌 Причина: Старые опубликованные записи (6+ месяцев)"
    echo "   💾 Потенциал: ${PUBLISHED_180_SIZE_MB} MB"
    echo "   🎯 Приоритет: НИЗКИЙ"
    echo "   ⚠️  ВНИМАНИЕ: Это опубликованный контент!"
    echo "   📋 Рекомендация: ОСТАВИТЬ или АРХИВИРОВАТЬ (не удалять)"
    echo ""
  fi

  echo "4️⃣  После очистки выполнить VACUUM для освобождения места"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "🎯 ИТОГО:"
  echo "   • Записей можно очистить: ${TOTAL_CLEANABLE}"
  echo "   • Место можно освободить: ${TOTAL_SIZE_CLEANABLE} MB"
  echo ""
  echo "💬 РЕШЕНИЕ:"
  echo "   1. УДАЛИТЬ failed > 30 дней? (${CLEAN_FAILED_30} записей, ${FAILED_30_SIZE_MB} MB)"
  echo "   2. УДАЛИТЬ drafted > 90 дней? (${CLEAN_DRAFTED_90} записей, ${DRAFTED_90_SIZE_MB} MB)"
  echo "   3. Что делать с published > 180 дней? (${CLEAN_PUBLISHED_180} записей, ${PUBLISHED_180_SIZE_MB} MB)"
  echo ""
  echo "🚀 Скажите ваше решение и я создам скрипты для безопасной очистки!"
else
  echo "✅ Таблица в отличном состоянии!"
  echo "   Нет записей, требующих очистки."
  echo ""
  echo "📊 Текущее состояние:"
  echo "   • Failed записей старше 30 дней: 0"
  echo "   • Drafted записей старше 90 дней: 0"
  echo "   • Published записей старше 180 дней: 0"
fi

echo ""
echo "✅ АНАЛИЗ ЗАВЕРШЕН!"
echo ""
