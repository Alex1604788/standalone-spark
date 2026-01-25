#!/usr/bin/env node

/**
 * Скрипт для диагностики проблемы с расходами
 * Выполняет SQL запросы из debug-campaign-expenses.sql
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🔍 ДИАГНОСТИКА ПРОБЛЕМЫ С РАСХОДАМИ');
console.log('=====================================');
console.log('Кампания: Кабель КГ 2*2,5');
console.log('Период: 1-31 декабря 2025');
console.log('');

// Запрос 4: За неделю (1-7 декабря)
console.log('📊 ЗАПРОС 4: За неделю (1-7 декабря) - ожидается ~24 428 ₽');
console.log('----------------------------------------------------------------');
const { data: data4, error: error4 } = await supabase
  .from('ozon_performance_daily')
  .select('stat_date, money_spent')
  .eq('campaign_name', 'Кабель КГ 2*2,5')
  .gte('stat_date', '2025-12-01')
  .lte('stat_date', '2025-12-07');

if (error4) {
  console.error('❌ Ошибка:', error4.message);
} else {
  // Дедупликация по дням
  const dailyExpenses = new Map();
  data4?.forEach(row => {
    const date = row.stat_date;
    const expense = Number(row.money_spent || 0);
    dailyExpenses.set(date, Math.max(dailyExpenses.get(date) || 0, expense));
  });

  const total = Array.from(dailyExpenses.values()).reduce((sum, val) => sum + val, 0);
  console.log(`Всего дней: ${dailyExpenses.size}`);
  console.log(`Общая сумма: ${total.toFixed(2)} ₽`);
  console.log(`Ожидалось: ~24 428 ₽`);
  console.log(`Разница: ${(total - 24428).toFixed(2)} ₽`);
  console.log(`Совпадает: ${Math.abs(total - 24428) < 100 ? '✅ ДА' : '❌ НЕТ'}`);
}
console.log('');

// Запрос 5: За месяц (1-31 декабря)
console.log('📊 ЗАПРОС 5: За месяц (1-31 декабря) - ожидается ~109 130 ₽');
console.log('----------------------------------------------------------------');
const { data: data5, error: error5 } = await supabase
  .from('ozon_performance_daily')
  .select('stat_date, money_spent')
  .eq('campaign_name', 'Кабель КГ 2*2,5')
  .gte('stat_date', '2025-12-01')
  .lte('stat_date', '2025-12-31');

if (error5) {
  console.error('❌ Ошибка:', error5.message);
} else {
  // Дедупликация по дням
  const dailyExpenses = new Map();
  data5?.forEach(row => {
    const date = row.stat_date;
    const expense = Number(row.money_spent || 0);
    dailyExpenses.set(date, Math.max(dailyExpenses.get(date) || 0, expense));
  });

  const total = Array.from(dailyExpenses.values()).reduce((sum, val) => sum + val, 0);
  console.log(`Всего дней с данными: ${dailyExpenses.size} из 31`);
  console.log(`Общая сумма: ${total.toFixed(2)} ₽`);
  console.log(`Ожидалось: ~109 130 ₽`);
  console.log(`Разница: ${(total - 109130).toFixed(2)} ₽`);
  console.log(`Совпадает: ${Math.abs(total - 109130) < 100 ? '✅ ДА' : '❌ НЕТ'}`);
  console.log('');

  if (dailyExpenses.size < 31) {
    console.log('⚠️ ПРОБЛЕМА: Не все дни декабря есть в базе!');
    console.log(`   Отсутствует ${31 - dailyExpenses.size} дней`);
    console.log('');
    console.log('📅 Даты с данными:');
    const dates = Array.from(dailyExpenses.keys()).sort();
    dates.forEach((date, i) => {
      console.log(`   ${String(i + 1).padStart(2)}. ${date}: ${dailyExpenses.get(date).toFixed(2).padStart(10)} ₽`);
    });
    console.log('');

    // Найдем отсутствующие даты
    const allDates = [];
    for (let day = 1; day <= 31; day++) {
      allDates.push(`2025-12-${String(day).padStart(2, '0')}`);
    }
    const missingDates = allDates.filter(date => !dailyExpenses.has(date));
    if (missingDates.length > 0) {
      console.log('❌ Отсутствующие даты:');
      missingDates.forEach(date => console.log(`   - ${date}`));
      console.log('');
    }
  } else {
    console.log('✅ Все 31 день декабря присутствуют в базе');
  }
}
console.log('');

// Запрос 6: Детальная информация по дням
console.log('📊 ЗАПРОС 6: Детальная информация по дням');
console.log('-------------------------------------------');
const { data: data6, error: error6 } = await supabase
  .from('ozon_performance_daily')
  .select('stat_date, money_spent, sku, campaign_id')
  .eq('campaign_name', 'Кабель КГ 2*2,5')
  .gte('stat_date', '2025-12-01')
  .lte('stat_date', '2025-12-31')
  .order('stat_date', { ascending: true });

if (error6) {
  console.error('❌ Ошибка:', error6.message);
} else {
  const byDate = new Map();
  data6?.forEach(row => {
    const date = row.stat_date;
    if (!byDate.has(date)) {
      byDate.set(date, {
        records: 0,
        skus: new Set(),
        campaignIds: new Set(),
        expenses: []
      });
    }
    const info = byDate.get(date);
    info.records++;
    if (row.sku) info.skus.add(row.sku);
    if (row.campaign_id) info.campaignIds.add(row.campaign_id);
    info.expenses.push(Number(row.money_spent || 0));
  });

  console.log('');
  console.log('Дата       | Расход      | Записей | SKU | Campaign IDs | Все одинаковые?');
  console.log('-----------|-------------|---------|-----|--------------|----------------');
  Array.from(byDate.entries()).sort().forEach(([date, info]) => {
    const maxExpense = Math.max(...info.expenses);
    const minExpense = Math.min(...info.expenses);
    const allSame = maxExpense === minExpense ? '✅' : '❌';
    console.log(
      `${date} | ${maxExpense.toFixed(2).padStart(10)} ₽ | ${String(info.records).padStart(7)} | ${String(info.skus.size).padStart(3)} | ${String(info.campaignIds.size).padStart(12)} | ${allSame}`
    );
  });
  console.log('');
  console.log(`Итого дней с данными: ${byDate.size} из 31`);
  console.log(`Всего записей: ${data6?.length || 0}`);
}
console.log('');

// Запрос 7: Проверка orders_model и revenue_model
console.log('📊 ЗАПРОС 7: Проверка наличия model данных');
console.log('-------------------------------------------');
const { data: data7, error: error7 } = await supabase
  .from('ozon_performance_daily')
  .select('orders, orders_model, revenue, revenue_model')
  .eq('campaign_name', 'Кабель КГ 2*2,5')
  .gte('stat_date', '2025-12-01')
  .lte('stat_date', '2025-12-31');

if (error7) {
  console.error('❌ Ошибка:', error7.message);
} else {
  let hasOrdersModel = 0;
  let hasRevenueModel = 0;
  let totalOrders = 0;
  let totalOrdersModel = 0;
  let totalRevenue = 0;
  let totalRevenueModel = 0;

  data7?.forEach(row => {
    if (row.orders_model != null && row.orders_model > 0) hasOrdersModel++;
    if (row.revenue_model != null && row.revenue_model > 0) hasRevenueModel++;
    totalOrders += Number(row.orders || 0);
    totalOrdersModel += Number(row.orders_model || 0);
    totalRevenue += Number(row.revenue || 0);
    totalRevenueModel += Number(row.revenue_model || 0);
  });

  console.log(`Всего записей: ${data7?.length || 0}`);
  console.log(`Записей с orders_model > 0: ${hasOrdersModel}`);
  console.log(`Записей с revenue_model > 0: ${hasRevenueModel}`);
  console.log('');
  console.log(`Сумма orders: ${totalOrders}`);
  console.log(`Сумма orders_model: ${totalOrdersModel}`);
  console.log(`Сумма revenue: ${totalRevenue.toFixed(2)} ₽`);
  console.log(`Сумма revenue_model: ${totalRevenueModel.toFixed(2)} ₽`);
  console.log('');
  console.log(`ИТОГО заказов (orders + orders_model): ${totalOrders + totalOrdersModel}`);
  console.log(`ИТОГО выручка (revenue + revenue_model): ${(totalRevenue + totalRevenueModel).toFixed(2)} ₽`);
}
console.log('');

console.log('=====================================');
console.log('✅ Диагностика завершена!');
console.log('');
console.log('💡 Выводы:');
console.log('   Если "Всего дней с данными" < 31, значит проблема в синхронизации OZON');
console.log('   Если все 31 день есть, но сумма не совпадает - проблема в логике дедупликации');
