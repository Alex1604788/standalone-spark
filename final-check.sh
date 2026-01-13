#!/bin/bash
set -e

# Загружаем переменные окружения
SUPABASE_URL=$(grep "^SUPABASE_URL=" .env.local | cut -d'=' -f2)
SUPABASE_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env.local | cut -d'=' -f2)

echo "🎯 ФИНАЛЬНАЯ ПРОВЕРКА СИНХРОНИЗАЦИИ И СУММИРОВАНИЯ"
echo "=================================================="
echo ""

# 1. Последняя синхронизация
echo "1️⃣ ПОСЛЕДНЯЯ СИНХРОНИЗАЦИЯ:"
echo "-------------------------------------------"
curl -k -s "${SUPABASE_URL}/rest/v1/ozon_sync_history?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&order=started_at.desc&limit=1&select=status,started_at,completed_at,campaigns_count,rows_inserted" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)[0]
    print(f'✅ Статус: {d[\"status\"]}')
    print(f'   Начало: {d[\"started_at\"][:19]}')
    print(f'   Завершено: {d[\"completed_at\"][:19] if d[\"completed_at\"] else \"не завершена\"}')
    print(f'   Кампаний: {d.get(\"campaigns_count\", 0)}')
    print(f'   Записей: {d.get(\"rows_inserted\", 0)}')
except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 2. Период данных
echo "2️⃣ ПЕРИОД ДАННЫХ:"
echo "-------------------------------------------"

FIRST=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_daily?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=stat_date&order=stat_date.asc&limit=1" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" 2>&1 | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['stat_date'])" 2>&1)

LAST=$(curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_daily?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=stat_date&order=stat_date.desc&limit=1" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" 2>&1 | python3 -c "import sys, json; print(json.load(sys.stdin)[0]['stat_date'])" 2>&1)

if [ -n "$FIRST" ] && [ -n "$LAST" ]; then
    DAYS=$(python3 -c "from datetime import datetime; print((datetime.fromisoformat('$LAST') - datetime.fromisoformat('$FIRST')).days + 1)")
    echo "✅ Первая дата: $FIRST"
    echo "✅ Последняя дата: $LAST"
    echo "✅ Период: $DAYS дней"
else
    echo "❌ Не удалось получить даты"
fi
echo ""

# 3. Проверка суммирования за последний день
echo "3️⃣ ПРОВЕРКА СУММИРОВАНИЯ (последний день):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&stat_date=eq.${LAST}&select=orders,orders_model,total_orders,revenue,revenue_model,total_revenue" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" 2>&1 | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if not data:
        print('⚠️ Нет данных за последний день')
    else:
        orders = sum(r.get('orders', 0) or 0 for r in data)
        orders_model = sum(r.get('orders_model', 0) or 0 for r in data)
        total_orders = sum(r.get('total_orders', 0) or 0 for r in data)

        revenue = sum(r.get('revenue', 0) or 0 for r in data)
        revenue_model = sum(r.get('revenue_model', 0) or 0 for r in data)
        total_revenue = sum(r.get('total_revenue', 0) or 0 for r in data)

        print(f'Записей: {len(data)}')
        print(f'')
        print(f'ЗАКАЗЫ за ${LAST}:')
        print(f'  orders:       {orders:>6}')
        print(f'  orders_model: {orders_model:>6}')
        print(f'  Сумма:        {orders + orders_model:>6}')
        print(f'  total_orders: {total_orders:>6} ', end='')
        if orders + orders_model == total_orders:
            print('✅')
        else:
            print(f'❌ (ожидалось {orders + orders_model})')

        print(f'')
        print(f'ВЫРУЧКА за ${LAST}:')
        print(f'  revenue:       {revenue:>12,.2f} ₽')
        print(f'  revenue_model: {revenue_model:>12,.2f} ₽')
        print(f'  Сумма:         {revenue + revenue_model:>12,.2f} ₽')
        print(f'  total_revenue: {total_revenue:>12,.2f} ₽ ', end='')
        if abs((revenue + revenue_model) - total_revenue) < 0.01:
            print('✅')
        else:
            print(f'❌')
except Exception as e:
    print(f'Ошибка: {e}')
" 2>&1
echo ""

# 4. Общая статистика
echo "4️⃣ ОБЩАЯ СТАТИСТИКА (все данные):"
echo "-------------------------------------------"

curl -k -s "${SUPABASE_URL}/rest/v1/ozon_performance_summary?marketplace_id=eq.84b1d0f5-6750-407c-9b04-28c051972162&select=stat_date" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" \
  -H "Range: 0-0" \
  -H "Prefer: count=exact" \
  -I 2>&1 | grep -i "content-range" | sed 's/.*\//Всего записей: /' || echo "Проверка количества записей..."

echo ""
echo "=================================================="
echo "✅ ПРОВЕРКА ЗАВЕРШЕНА"
echo "=================================================="
