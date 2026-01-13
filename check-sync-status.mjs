#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Загрузить переменные окружения из .env.local
const envFile = readFileSync('.env.local', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  if (line && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  }
});

const supabaseUrl = envVars.SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не найдены');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const MARKETPLACE_ID = '84b1d0f5-6750-407c-9b04-28c051972162';

console.log('🔍 БЫСТРАЯ ПРОВЕРКА СИНХРОНИЗАЦИИ\n');
console.log('='.repeat(70));

// 1. Проверка последней синхронизации
console.log('\n1️⃣ ПОСЛЕДНЯЯ СИНХРОНИЗАЦИЯ');
console.log('-'.repeat(70));

const { data: lastSync, error: syncError } = await supabase
  .from('ozon_sync_history')
  .select('status, started_at, completed_at, campaigns_count, rows_inserted, error_message')
  .eq('marketplace_id', MARKETPLACE_ID)
  .order('started_at', { ascending: false })
  .limit(1)
  .single();

if (syncError) {
  console.error('❌ Ошибка:', syncError.message);
} else {
  const startTime = new Date(lastSync.started_at).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const endTime = lastSync.completed_at
    ? new Date(lastSync.completed_at).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      })
    : 'не завершена';

  const result = !lastSync.error_message || lastSync.error_message === ''
    ? '✅ OK'
    : `❌ ${lastSync.error_message.substring(0, 50)}`;

  console.log(`Статус:     ${lastSync.status}`);
  console.log(`Начало:     ${startTime}`);
  console.log(`Окончание:  ${endTime}`);
  console.log(`Кампаний:   ${lastSync.campaigns_count || 0}`);
  console.log(`Записей:    ${lastSync.rows_inserted || 0}`);
  console.log(`Результат:  ${result}`);
}

// 2. Период данных
console.log('\n2️⃣ ПЕРИОД ДАННЫХ');
console.log('-'.repeat(70));

const { data: periodData, error: periodError } = await supabase.rpc('get_ozon_data_period', {
  p_marketplace_id: MARKETPLACE_ID
});

if (periodError) {
  console.log('⚠️ Запрос через RPC не сработал, пробую прямой запрос...');

  const { data: rawData, error: rawError } = await supabase
    .from('ozon_performance_daily')
    .select('stat_date')
    .eq('marketplace_id', MARKETPLACE_ID)
    .order('stat_date', { ascending: true });

  if (rawError || !rawData || rawData.length === 0) {
    console.error('❌ Нет данных в таблице ozon_performance_daily');
  } else {
    const dates = rawData.map(r => r.stat_date);
    const firstDate = new Date(dates[0]);
    const lastDate = new Date(dates[dates.length - 1]);
    const daysDiff = Math.floor((lastDate - firstDate) / (1000 * 60 * 60 * 24)) + 1;

    console.log(`Первая дата:    ${firstDate.toLocaleDateString('ru-RU')}`);
    console.log(`Последняя дата: ${lastDate.toLocaleDateString('ru-RU')}`);
    console.log(`Дней:           ${daysDiff}`);
    console.log(`Записей:        ${rawData.length}`);
    console.log(`Результат:      ${daysDiff >= 62 ? '✅ Есть 62+ дня' : '⚠️ Меньше 62 дней'}`);
  }
} else {
  console.log(periodData);
}

// 3. Проверка VIEW
console.log('\n3️⃣ VIEW ДЛЯ АВТОСУММИРОВАНИЯ');
console.log('-'.repeat(70));

const { data: viewCheck, error: viewError } = await supabase
  .from('ozon_performance_summary')
  .select('id')
  .eq('marketplace_id', MARKETPLACE_ID)
  .limit(1);

if (viewError) {
  if (viewError.message.includes('does not exist')) {
    console.log('❌ VIEW не найден');
  } else {
    console.log('⚠️ Ошибка проверки VIEW:', viewError.message);
  }
} else {
  console.log('✅ VIEW существует');
}

// 4. Итоговая статистика
console.log('\n4️⃣ ИТОГОВАЯ СТАТИСТИКА');
console.log('-'.repeat(70));

const { data: summary, error: summaryError } = await supabase
  .from('ozon_performance_summary')
  .select('total_orders, total_revenue, money_spent')
  .eq('marketplace_id', MARKETPLACE_ID);

if (summaryError) {
  console.log('⚠️ Не удалось получить статистику через VIEW');
  console.log('   Используем прямой запрос к таблице...');

  const { data: rawSummary, error: rawSummaryError } = await supabase
    .from('ozon_performance_daily')
    .select('orders, orders_model, revenue, revenue_model, money_spent')
    .eq('marketplace_id', MARKETPLACE_ID);

  if (!rawSummaryError && rawSummary) {
    const totalOrders = rawSummary.reduce((sum, r) => sum + (r.orders || 0) + (r.orders_model || 0), 0);
    const totalRevenue = rawSummary.reduce((sum, r) => sum + (r.revenue || 0) + (r.revenue_model || 0), 0);
    const totalSpent = rawSummary.reduce((sum, r) => sum + (r.money_spent || 0), 0);

    console.log(`Всего записей:  ${rawSummary.length}`);
    console.log(`Всего заказов:  ${totalOrders}`);
    console.log(`Всего выручка:  ${totalRevenue.toFixed(2)} ₽`);
    console.log(`Всего расход:   ${totalSpent.toFixed(2)} ₽`);
  }
} else if (summary) {
  const totalOrders = summary.reduce((sum, r) => sum + (r.total_orders || 0), 0);
  const totalRevenue = summary.reduce((sum, r) => sum + (r.total_revenue || 0), 0);
  const totalSpent = summary.reduce((sum, r) => sum + (r.money_spent || 0), 0);

  console.log(`Всего записей:  ${summary.length}`);
  console.log(`Всего заказов:  ${totalOrders}`);
  console.log(`Всего выручка:  ${totalRevenue.toFixed(2)} ₽`);
  console.log(`Всего расход:   ${totalSpent.toFixed(2)} ₽`);
}

console.log('\n' + '='.repeat(70));
console.log('✅ Проверка завершена\n');
