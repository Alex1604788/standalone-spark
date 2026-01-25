#!/bin/bash
set -e

# Загружаем переменные окружения
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env.local | cut -d'=' -f2)
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d'=' -f2)

echo "🔍 ПРОВЕРКА РАСХОДОВ ПО ПЕРИОДАМ (2025)"
echo "========================================"
echo ""

MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"

# 1. Декабрь 01-31 2025
echo "1️⃣ ДЕКАБРЬ 2025: 01-31 (2025-12-01 до 2025-12-31):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2025-12-01&stat_date=lte.2025-12-31&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total_spent = sum(float(r.get('money_spent', 0) or 0) for r in data)
    unique_dates = set(r['stat_date'] for r in data)

    print(f'Записей: {len(data)}')
    print(f'Уникальных дат: {len(unique_dates)}')
    if unique_dates:
        print(f'Диапазон дат: {min(unique_dates)} - {max(unique_dates)}')
    print(f'Общие расходы: {total_spent:,.2f} руб')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 2. Декабрь 01-14 2025
echo "2️⃣ ДЕКАБРЬ 2025: 01-14 (2025-12-01 до 2025-12-14):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2025-12-01&stat_date=lte.2025-12-14&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total_spent = sum(float(r.get('money_spent', 0) or 0) for r in data)
    unique_dates = set(r['stat_date'] for r in data)

    print(f'Записей: {len(data)}')
    print(f'Уникальных дат: {len(unique_dates)}')
    if unique_dates:
        print(f'Диапазон дат: {min(unique_dates)} - {max(unique_dates)}')
    print(f'Общие расходы: {total_spent:,.2f} руб')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 3. Детализация по дням декабря 2025
echo "3️⃣ ДЕТАЛИЗАЦИЯ ПО ДНЯМ ДЕКАБРЯ 2025:"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2025-12-01&stat_date=lte.2025-12-31&select=money_spent,stat_date,campaign_id,sku" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
from collections import defaultdict
try:
    data = json.load(sys.stdin)

    # Группируем по датам
    by_date = defaultdict(lambda: {'count': 0, 'total': 0, 'unique_campaigns': set(), 'unique_skus': set()})
    for r in data:
        date = r['stat_date']
        by_date[date]['count'] += 1
        by_date[date]['total'] += float(r.get('money_spent', 0) or 0)
        if r.get('campaign_id'):
            by_date[date]['unique_campaigns'].add(r['campaign_id'])
        if r.get('sku'):
            by_date[date]['unique_skus'].add(r['sku'])

    # Сортируем по дате
    sorted_dates = sorted(by_date.keys())

    print(f'Дата         Записей   Кампании  SKU   Расходы')
    print('-' * 60)

    for date in sorted_dates:
        stats = by_date[date]
        print(f'{date}  {stats[\"count\"]:>7}  {len(stats[\"unique_campaigns\"]):>8}  {len(stats[\"unique_skus\"]):>4}  {stats[\"total\"]:>12,.2f}')

    # Итого
    total_records = sum(s['count'] for s in by_date.values())
    total_spent = sum(s['total'] for s in by_date.values())
    print('-' * 60)
    print(f'ИТОГО:       {total_records:>7}                      {total_spent:>12,.2f}')

except Exception as e:
    print(f'Ошибка: {e}')
    import traceback
    traceback.print_exc()
" 2>&1
echo ""

# 4. Январь 2026 для сравнения
echo "4️⃣ ЯНВАРЬ 2026: 01-14 (для сравнения):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2026-01-01&stat_date=lte.2026-01-14&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total_spent = sum(float(r.get('money_spent', 0) or 0) for r in data)
    unique_dates = set(r['stat_date'] for r in data)

    print(f'Записей: {len(data)}')
    print(f'Уникальных дат: {len(unique_dates)}')
    if unique_dates:
        print(f'Диапазон дат: {min(unique_dates)} - {max(unique_dates)}')
    print(f'Общие расходы: {total_spent:,.2f} руб')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

echo "========================================"
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
echo "========================================"
