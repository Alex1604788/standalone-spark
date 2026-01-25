#!/usr/bin/env python3
"""
Тестирование логики дедупликации из PromotionAnalytics.tsx
Проверяем, правильно ли работает дедупликация
"""

import urllib.request
import urllib.parse
import json

SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ"

def fetch_data(date_from, date_to):
    """Получить данные из Supabase - ТОЧНАЯ копия запроса из PromotionAnalytics.tsx"""
    url = f"{SUPABASE_URL}/rest/v1/ozon_performance_summary"  # Используем VIEW!
    campaign_name_encoded = urllib.parse.quote("Кабель КГ 2*2,5")
    params = f"?campaign_name=eq.{campaign_name_encoded}&stat_date=gte.{date_from}&stat_date=lte.{date_to}&select=campaign_id,campaign_name,stat_date,money_spent,sku"

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

print('🔍 ТЕСТ ЛОГИКИ ДЕДУПЛИКАЦИИ')
print('============================')
print('')

# Тест за месяц - как в приложении
print('📊 Запрос данных за месяц (1-31 декабря) через VIEW ozon_performance_summary')
print('----------------------------------------------------------------------------')
data = fetch_data('2025-12-01', '2025-12-31')

if not data:
    print('❌ Нет данных!')
    exit(1)

print(f'Загружено записей: {len(data)}')
print('')

# ШАГ 1: Дедупликация - как в PromotionAnalytics.tsx (строки 268-282)
print('ШАГ 1: Дедупликация расходов по (campaign_id, stat_date)')
print('--------------------------------------------------------')

campaign_daily_expenses = {}  # campaign_id -> { date -> money_spent }

for row in data:
    campaign_id = row['campaign_id'] if row.get('campaign_id') else '__NO_CAMPAIGN__'
    date = row['stat_date']
    expense = float(row.get('money_spent', 0))

    if campaign_id not in campaign_daily_expenses:
        campaign_daily_expenses[campaign_id] = {}

    if date not in campaign_daily_expenses[campaign_id]:
        campaign_daily_expenses[campaign_id][date] = expense
    else:
        # Берем максимум (как в коде: Math.max)
        campaign_daily_expenses[campaign_id][date] = max(
            campaign_daily_expenses[campaign_id][date],
            expense
        )

print(f'Кампаний найдено: {len(campaign_daily_expenses)}')
print('')

for campaign_id, daily_map in campaign_daily_expenses.items():
    total = sum(daily_map.values())
    print(f'Campaign ID: {campaign_id}')
    print(f'  Дней: {len(daily_map)}')
    print(f'  Общая сумма: {total:.2f} ₽')
    print(f'  Первые 3 дня:')
    for date, expense in sorted(daily_map.items())[:3]:
        print(f'    {date}: {expense:.2f} ₽')
    print('')

print('============================')
print('✅ Тест завершен!')
