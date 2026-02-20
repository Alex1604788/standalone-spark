#!/bin/bash

# Supabase Configuration
SUPABASE_URL="https://bkmicyguzlwampuindff.supabase.co"
SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk"

echo "═══════════════════════════════════════════════════════════════════════════"
echo "🔍 ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ OZON"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Дата проверки: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Helper function to make API requests
api_get() {
    curl -s "$SUPABASE_URL/rest/v1/$1" \
        -H "apikey: $SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H "Content-Type: application/json"
}

# 1. Проверка маркетплейсов
echo "───────────────────────────────────────────────────────────────────────────"
echo "1️⃣  ПРОВЕРКА МАРКЕТПЛЕЙСОВ OZON"
echo "───────────────────────────────────────────────────────────────────────────"
MARKETPLACE=$(api_get "marketplaces?type=eq.ozon&select=id,name,last_sync_at,is_active,sync_mode")
echo "$MARKETPLACE" | python3 -m json.tool
LAST_SYNC=$(echo "$MARKETPLACE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data[0]['last_sync_at'] if data else 'NONE')" 2>/dev/null)

if [ "$LAST_SYNC" != "NONE" ] && [ -n "$LAST_SYNC" ]; then
    LAST_SYNC_TS=$(date -d "$LAST_SYNC" +%s 2>/dev/null || echo "0")
    NOW_TS=$(date +%s)
    DIFF_MINUTES=$(( ($NOW_TS - $LAST_SYNC_TS) / 60 ))

    echo ""
    echo "⏰ Последняя синхронизация: $LAST_SYNC"
    echo "⏱️  Прошло времени: $DIFF_MINUTES минут"

    if [ $DIFF_MINUTES -lt 15 ]; then
        echo "✅ Статус: Синхронизация работает"
    elif [ $DIFF_MINUTES -lt 60 ]; then
        echo "⚠️  Статус: Небольшая задержка"
    else
        echo "❌ Статус: Синхронизация НЕ РАБОТАЕТ!"
    fi
else
    echo "❌ Синхронизация не настроена или никогда не запускалась"
fi

# 2. Статистика по отзывам
echo ""
echo "───────────────────────────────────────────────────────────────────────────"
echo "2️⃣  СТАТИСТИКА ПО ОТЗЫВАМ"
echo "───────────────────────────────────────────────────────────────────────────"

# Get total reviews
REVIEWS=$(api_get "reviews?deleted_at=is.null&select=id,is_answered,segment,rating" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total = len(data)
    answered = sum(1 for r in data if r.get('is_answered'))
    unanswered_segment = sum(1 for r in data if r.get('segment') == 'unanswered')
    pending_segment = sum(1 for r in data if r.get('segment') == 'pending')

    print(f'Всего отзывов: {total}')
    print(f'С ответами (is_answered=true): {answered}')
    print(f'Сегмент unanswered: {unanswered_segment}')
    print(f'Сегмент pending: {pending_segment}')
except:
    print('Ошибка при обработке данных')
")

echo "$REVIEWS"

# 3. Статистика по ответам (replies)
echo ""
echo "───────────────────────────────────────────────────────────────────────────"
echo "3️⃣  СТАТИСТИКА ПО ОТВЕТАМ"
echo "───────────────────────────────────────────────────────────────────────────"

REPLIES=$(api_get "replies?deleted_at=is.null&select=id,status" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total = len(data)
    published = sum(1 for r in data if r.get('status') == 'published')
    drafted = sum(1 for r in data if r.get('status') == 'drafted')
    scheduled = sum(1 for r in data if r.get('status') == 'scheduled')
    failed = sum(1 for r in data if r.get('status') == 'failed')

    print(f'Всего ответов: {total}')
    print(f'Опубликованных (published): {published}')
    print(f'Черновиков (drafted): {drafted}')
    print(f'Запланированных (scheduled): {scheduled}')
    print(f'С ошибками (failed): {failed}')
except:
    print('Ошибка при обработке данных')
")

echo "$REPLIES"

# 4. Проверка на дубли
echo ""
echo "───────────────────────────────────────────────────────────────────────────"
echo "4️⃣  ПРОВЕРКА НА ДУБЛИ ОТВЕТОВ"
echo "───────────────────────────────────────────────────────────────────────────"

# Get all replies grouped by review_id
DUPLICATES=$(api_get "replies?deleted_at=is.null&select=review_id,id" | python3 -c "
import sys, json
from collections import Counter
try:
    data = json.load(sys.stdin)
    review_counts = Counter(r['review_id'] for r in data if r.get('review_id'))
    duplicates = {k: v for k, v in review_counts.items() if v > 1}

    if duplicates:
        print(f'❌ НАЙДЕНЫ ДУБЛИ: {len(duplicates)} отзывов с несколькими ответами')
        for review_id, count in list(duplicates.items())[:10]:
            print(f'   Review ID: {review_id} → {count} ответов')
    else:
        print('✅ Дублей НЕ НАЙДЕНО')
except Exception as e:
    print(f'Ошибка: {e}')
")

echo "$DUPLICATES"

# 5. Последние 10 отзывов
echo ""
echo "───────────────────────────────────────────────────────────────────────────"
echo "5️⃣  ПОСЛЕДНИЕ 10 ОТЗЫВОВ"
echo "───────────────────────────────────────────────────────────────────────────"

RECENT=$(api_get "reviews?deleted_at=is.null&select=external_id,created_at,rating,is_answered,segment&order=created_at.desc&limit=10")
echo "$RECENT" | python3 -c "
import sys, json
from datetime import datetime
try:
    data = json.load(sys.stdin)
    print(f'{'External ID':<20} {'Дата':<12} {'Рейтинг':<8} {'Ответ':<6} {'Сегмент':<12}')
    print('-' * 70)
    for r in data:
        ext_id = (r.get('external_id') or 'N/A')[:20]
        created = datetime.fromisoformat(r['created_at'].replace('Z', '+00:00')).strftime('%Y-%m-%d')
        rating = r.get('rating', '?')
        answered = '✅' if r.get('is_answered') else '❌'
        segment = r.get('segment', 'N/A')
        print(f'{ext_id:<20} {created:<12} {rating:<8} {answered:<6} {segment:<12}')
except Exception as e:
    print(f'Ошибка: {e}')
"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "✅ ДИАГНОСТИКА ЗАВЕРШЕНА"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "📝 Для проверки Edge Functions и cron jobs откройте Supabase Dashboard:"
echo "   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/logs/edge-functions"
echo ""
echo "📊 Для проверки cron jobs выполните SQL запрос:"
echo "   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%ozon%';"
echo ""
