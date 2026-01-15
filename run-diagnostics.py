#!/usr/bin/env python3
"""
Скрипт для диагностики проблемы с расходами
Выполняет запросы к Supabase API
"""

import urllib.request
import urllib.parse
import json
from collections import defaultdict

SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"

def fetch_data(date_from, date_to):
    """Получить данные из Supabase"""
    url = f"{SUPABASE_URL}/rest/v1/ozon_performance_daily"
    campaign_name_encoded = urllib.parse.quote("Кабель КГ 2*2,5")
    params = f"?campaign_name=eq.{campaign_name_encoded}&stat_date=gte.{date_from}&stat_date=lte.{date_to}&select=stat_date,money_spent,sku,campaign_id"

    headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    }

    req = urllib.request.Request(url + params, headers=headers)

    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"❌ Ошибка при запросе: {e}")
        return []

def deduplicate_expenses(data):
    """Дедупликация расходов по дням"""
    daily_expenses = {}
    for row in data:
        date = row['stat_date']
        expense = float(row.get('money_spent', 0))
        if date not in daily_expenses:
            daily_expenses[date] = expense
        else:
            daily_expenses[date] = max(daily_expenses[date], expense)
    return daily_expenses

print('🔍 ДИАГНОСТИКА ПРОБЛЕМЫ С РАСХОДАМИ')
print('=====================================')
print('Кампания: Кабель КГ 2*2,5')
print('Период: 1-31 декабря 2025')
print('')

# Запрос 1: За неделю (1-7 декабря)
print('📊 ЗАПРОС 4: За неделю (1-7 декабря) - ожидается ~24 428 ₽')
print('----------------------------------------------------------------')
data_week = fetch_data('2025-12-01', '2025-12-07')

if data_week:
    daily_exp = deduplicate_expenses(data_week)
    total = sum(daily_exp.values())
    print(f'Всего дней: {len(daily_exp)}')
    print(f'Общая сумма: {total:.2f} ₽')
    print(f'Ожидалось: ~24 428 ₽')
    print(f'Разница: {total - 24428:.2f} ₽')
    print(f'Совпадает: {"✅ ДА" if abs(total - 24428) < 100 else "❌ НЕТ"}')
else:
    print('❌ Нет данных')
print('')

# Запрос 2: За месяц (1-31 декабря)
print('📊 ЗАПРОС 5: За месяц (1-31 декабря) - ожидается ~109 130 ₽')
print('----------------------------------------------------------------')
data_month = fetch_data('2025-12-01', '2025-12-31')

if data_month:
    daily_exp = deduplicate_expenses(data_month)
    total = sum(daily_exp.values())
    print(f'Всего дней с данными: {len(daily_exp)} из 31')
    print(f'Общая сумма: {total:.2f} ₽')
    print(f'Ожидалось: ~109 130 ₽')
    print(f'Разница: {total - 109130:.2f} ₽')
    print(f'Совпадает: {"✅ ДА" if abs(total - 109130) < 100 else "❌ НЕТ"}')
    print('')

    if len(daily_exp) < 31:
        print('⚠️ ПРОБЛЕМА: Не все дни декабря есть в базе!')
        print(f'   Отсутствует {31 - len(daily_exp)} дней')
        print('')
        print('📅 Даты с данными:')
        for i, (date, expense) in enumerate(sorted(daily_exp.items()), 1):
            print(f'   {i:2}. {date}: {expense:>10.2f} ₽')
        print('')

        # Найдем отсутствующие даты
        all_dates = [f'2025-12-{day:02d}' for day in range(1, 32)]
        missing_dates = [d for d in all_dates if d not in daily_exp]
        if missing_dates:
            print('❌ Отсутствующие даты:')
            for date in missing_dates:
                print(f'   - {date}')
            print('')
    else:
        print('✅ Все 31 день декабря присутствуют в базе')
        print('')
else:
    print('❌ Нет данных')
print('')

# Запрос 3: Детальная информация
if data_month:
    print('📊 ЗАПРОС 6: Детальная информация по дням')
    print('-------------------------------------------')

    by_date = defaultdict(lambda: {'records': 0, 'skus': set(), 'expenses': []})
    for row in data_month:
        date = row['stat_date']
        by_date[date]['records'] += 1
        if row.get('sku'):
            by_date[date]['skus'].add(row['sku'])
        by_date[date]['expenses'].append(float(row.get('money_spent', 0)))

    print('')
    print('Дата       | Расход      | Записей | SKU | Все одинаковые?')
    print('-----------|-------------|---------|-----|----------------')
    for date in sorted(by_date.keys()):
        info = by_date[date]
        max_exp = max(info['expenses'])
        min_exp = min(info['expenses'])
        all_same = '✅' if max_exp == min_exp else '❌'
        print(f'{date} | {max_exp:>10.2f} ₽ | {info["records"]:>7} | {len(info["skus"]):>3} | {all_same}')

    print('')
    print(f'Итого дней с данными: {len(by_date)} из 31')
    print(f'Всего записей: {len(data_month)}')
    print('')

print('=====================================')
print('✅ Диагностика завершена!')
print('')
print('💡 Выводы:')
print('   Если "Всего дней с данными" < 31, значит проблема в синхронизации OZON')
print('   Если все 31 день есть, но сумма не совпадает - проблема в логике дедупликации')
