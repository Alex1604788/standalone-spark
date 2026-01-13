#!/bin/bash
source .env.local

echo "📊 ДЕТАЛЬНАЯ ПРОВЕРКА СУММИРОВАНИЯ"
echo "=========================================="
echo ""

# 1. Проверка данных за последние 5 дней
echo "1. ДАННЫЕ ЗА ПОСЛЕДНИЕ 5 ДНЕЙ (из VIEW):"
echo "-------------------------------------------"

QUERY='
SELECT
  stat_date,
  COUNT(*) as records,
  SUM(orders) as orders,
  SUM(orders_model) as orders_model,
  SUM(total_orders) as total_orders_view,
  ROUND(SUM(revenue)::numeric, 2) as revenue,
  ROUND(SUM(revenue_model)::numeric, 2) as revenue_model,
  ROUND(SUM(total_revenue)::numeric, 2) as total_revenue_view
FROM ozon_performance_summary
WHERE marketplace_id = '\''84b1d0f5-6750-407c-9b04-28c051972162'\''
GROUP BY stat_date
ORDER BY stat_date DESC
LIMIT 5
'

curl -k -s "${SUPABASE_URL}/rest/v1/rpc/exec_raw_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\"}" 2>/dev/null || \
  echo "Прямой запрос через RPC не работает, использую альтернативный метод..."

# Альтернативный метод - через REST API с агрегацией
echo ""
echo "Получение данных через REST API..."
echo ""

DATA=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&order=stat_date.desc&limit=100" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "$DATA" | python3 <<'PYTHON'
import sys, json
from collections import defaultdict

try:
    data = json.load(sys.stdin)

    # Группируем по дате
    by_date = defaultdict(lambda: {
        'records': 0,
        'orders': 0,
        'orders_model': 0,
        'total_orders': 0,
        'revenue': 0,
        'revenue_model': 0,
        'total_revenue': 0
    })

    for row in data:
        date = row.get('stat_date')
        stats = by_date[date]
        stats['records'] += 1
        stats['orders'] += row.get('orders', 0) or 0
        stats['orders_model'] += row.get('orders_model', 0) or 0
        stats['total_orders'] += row.get('total_orders', 0) or 0
        stats['revenue'] += row.get('revenue', 0) or 0
        stats['revenue_model'] += row.get('revenue_model', 0) or 0
        stats['total_revenue'] += row.get('total_revenue', 0) or 0

    # Сортируем по дате (последние 5)
    sorted_dates = sorted(by_date.keys(), reverse=True)[:5]

    print(f"{'Дата':<12} {'Записей':<9} {'Orders':<8} {'Model':<8} {'Total':<8} {'Revenue':<10} {'RevModel':<10} {'TotalRev':<10} {'Проверка':<10}")
    print("-" * 95)

    for date in sorted_dates:
        stats = by_date[date]
        manual_sum = stats['orders'] + stats['orders_model']
        view_sum = stats['total_orders']
        check = "✅" if manual_sum == view_sum else f"❌ {manual_sum}"

        print(f"{date:<12} {stats['records']:<9} {stats['orders']:<8} {stats['orders_model']:<8} "
              f"{stats['total_orders']:<8} {stats['revenue']:<10.2f} {stats['revenue_model']:<10.2f} "
              f"{stats['total_revenue']:<10.2f} {check:<10}")

except Exception as e:
    print(f"Ошибка: {e}")
    print("Сырые данные:")
    print(sys.stdin.read()[:500])
PYTHON

echo ""
echo "=========================================="
echo ""

# 2. Общая статистика
echo "2. ОБЩАЯ СТАТИСТИКА:"
echo "-------------------------------------------"

TOTAL=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=orders,orders_model,total_orders,revenue,revenue_model,total_revenue" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}")

echo "$TOTAL" | python3 <<'PYTHON'
import sys, json

try:
    data = json.load(sys.stdin)

    total_orders = sum(r.get('orders', 0) or 0 for r in data)
    total_orders_model = sum(r.get('orders_model', 0) or 0 for r in data)
    total_orders_view = sum(r.get('total_orders', 0) or 0 for r in data)

    total_revenue = sum(r.get('revenue', 0) or 0 for r in data)
    total_revenue_model = sum(r.get('revenue_model', 0) or 0 for r in data)
    total_revenue_view = sum(r.get('total_revenue', 0) or 0 for r in data)

    print(f"Всего записей: {len(data)}")
    print("")
    print("ЗАКАЗЫ:")
    print(f"  orders:        {total_orders:>10}")
    print(f"  orders_model:  {total_orders_model:>10}")
    print(f"  Сумма вручную: {total_orders + total_orders_model:>10}")
    print(f"  total_orders (VIEW): {total_orders_view:>10}")

    if total_orders + total_orders_model == total_orders_view:
        print(f"  Статус: ✅ Суммирование работает правильно")
    else:
        print(f"  Статус: ❌ Расхождение!")

    print("")
    print("ВЫРУЧКА:")
    print(f"  revenue:       {total_revenue:>15,.2f} ₽")
    print(f"  revenue_model: {total_revenue_model:>15,.2f} ₽")
    print(f"  Сумма вручную: {total_revenue + total_revenue_model:>15,.2f} ₽")
    print(f"  total_revenue (VIEW): {total_revenue_view:>15,.2f} ₽")

    if abs((total_revenue + total_revenue_model) - total_revenue_view) < 0.01:
        print(f"  Статус: ✅ Суммирование работает правильно")
    else:
        print(f"  Статус: ❌ Расхождение!")

except Exception as e:
    print(f"Ошибка: {e}")
PYTHON

echo ""
echo "=========================================="
