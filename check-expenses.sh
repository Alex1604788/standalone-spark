#!/bin/bash
set -e

# Загружаем переменные окружения
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env.local | cut -d'=' -f2)
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d'=' -f2)

echo "🔍 ПРОВЕРКА РАСХОДОВ ПО ПЕРИОДАМ"
echo "========================================"
echo ""

MARKETPLACE_ID="84b1d0f5-6750-407c-9b04-28c051972162"

# 1. Декабрь 01-31
echo "1️⃣ ДЕКАБРЬ 01-31 (2024-12-01 до 2024-12-31):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2024-12-01&stat_date=lte.2024-12-31&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total_spent = sum(float(r.get('money_spent', 0) or 0) for r in data)
    unique_dates = set(r['stat_date'] for r in data)

    print(f'Записей: {len(data)}')
    print(f'Уникальных дат: {len(unique_dates)}')
    print(f'Диапазон дат: {min(unique_dates) if unique_dates else \"нет данных\"} - {max(unique_dates) if unique_dates else \"нет данных\"}')
    print(f'Общие расходы: {total_spent:,.2f} ₽')

    # Проверка на дубликаты - считаем записи по датам
    from collections import Counter
    date_counts = Counter(r['stat_date'] for r in data)
    max_records_per_date = max(date_counts.values()) if date_counts else 0
    print(f'Максимум записей на одну дату: {max_records_per_date}')

    # Показываем несколько дат с большим количеством записей
    top_dates = sorted(date_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    if top_dates:
        print(f'Топ-3 дат по количеству записей:')
        for date, count in top_dates:
            print(f'  {date}: {count} записей')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 2. Декабрь 01-14
echo "2️⃣ ДЕКАБРЬ 01-14 (2024-12-01 до 2024-12-14):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2024-12-01&stat_date=lte.2024-12-14&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    total_spent = sum(float(r.get('money_spent', 0) or 0) for r in data)
    unique_dates = set(r['stat_date'] for r in data)

    print(f'Записей: {len(data)}')
    print(f'Уникальных дат: {len(unique_dates)}')
    print(f'Диапазон дат: {min(unique_dates) if unique_dates else \"нет данных\"} - {max(unique_dates) if unique_dates else \"нет данных\"}')
    print(f'Общие расходы: {total_spent:,.2f} ₽')

    # Проверка на дубликаты
    from collections import Counter
    date_counts = Counter(r['stat_date'] for r in data)
    max_records_per_date = max(date_counts.values()) if date_counts else 0
    print(f'Максимум записей на одну дату: {max_records_per_date}')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 3. Сравнение расходов по дням декабря
echo "3️⃣ ДЕТАЛИЗАЦИЯ ПО ДНЯМ ДЕКАБРЯ:"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=gte.2024-12-01&stat_date=lte.2024-12-31&select=money_spent,stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
from collections import defaultdict
try:
    data = json.load(sys.stdin)

    # Группируем по датам
    by_date = defaultdict(lambda: {'count': 0, 'total': 0})
    for r in data:
        date = r['stat_date']
        by_date[date]['count'] += 1
        by_date[date]['total'] += float(r.get('money_spent', 0) or 0)

    # Сортируем по дате
    sorted_dates = sorted(by_date.keys())

    print(f'{'Дата':<12} {'Записей':<10} {'Расходы, ₽':<15}')
    print('-' * 40)

    for date in sorted_dates:
        stats = by_date[date]
        print(f'{date:<12} {stats[\"count\"]:<10} {stats[\"total\"]:>14,.2f}')

    # Итого
    total_records = sum(s['count'] for s in by_date.values())
    total_spent = sum(s['total'] for s in by_date.values())
    print('-' * 40)
    print(f'{'ИТОГО:':<12} {total_records:<10} {total_spent:>14,.2f}')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 4. Проверка на дубликаты по campaign_id + sku + stat_date
echo "4️⃣ ПРОВЕРКА НА ДУБЛИКАТЫ (первые 100 записей):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.${MARKETPLACE_ID}&stat_date=eq.2024-12-01&select=campaign_id,campaign_name,sku,money_spent&limit=100" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
from collections import Counter
try:
    data = json.load(sys.stdin)

    # Проверяем дубликаты по ключу (campaign_id, sku)
    keys = [(r.get('campaign_id'), r.get('sku')) for r in data]
    key_counts = Counter(keys)
    duplicates = {k: v for k, v in key_counts.items() if v > 1}

    print(f'Всего записей: {len(data)}')
    print(f'Уникальных комбинаций (campaign_id + sku): {len(key_counts)}')
    print(f'Дубликатов: {len(duplicates)}')

    if duplicates:
        print(f'')
        print(f'Примеры дубликатов:')
        for (campaign_id, sku), count in list(duplicates.items())[:5]:
            print(f'  Campaign {campaign_id}, SKU {sku}: {count} раз')
            # Показываем записи с этим ключом
            matching = [r for r in data if r.get('campaign_id') == campaign_id and r.get('sku') == sku]
            for m in matching:
                print(f'    money_spent: {m.get(\"money_spent\")}')
    else:
        print(f'✅ Дубликатов не найдено')

except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

echo "========================================"
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
echo "========================================"
