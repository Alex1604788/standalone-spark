#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkViewAndData() {
  console.log('\n🔍 ПРОВЕРКА VIEW И ДАННЫХ\n');
  console.log('='.repeat(60));

  // 1. Проверяем существование VIEW
  console.log('\n1️⃣ Проверка существования VIEW ozon_performance_summary...');
  try {
    const { data: viewCheck, error: viewError } = await supabase
      .from('ozon_performance_summary')
      .select('id')
      .limit(1);

    if (viewError) {
      console.log('❌ VIEW не существует или недоступен:', viewError.message);
      console.log('   РЕШЕНИЕ: Нужно применить миграцию 20260112000000_create_ozon_performance_summary_view.sql');
      console.log('   или выполнить скрипт fix-view-safe.sql в Supabase SQL Editor');
      return;
    } else {
      console.log('✅ VIEW ozon_performance_summary существует и доступен');
    }
  } catch (err) {
    console.log('❌ Ошибка при проверке VIEW:', err.message);
    return;
  }

  // 2. Проверяем количество записей в базовой таблице
  console.log('\n2️⃣ Проверка данных в ozon_performance_daily...');
  const { count: dailyCount, error: dailyError } = await supabase
    .from('ozon_performance_daily')
    .select('*', { count: 'exact', head: true });

  if (dailyError) {
    console.log('❌ Ошибка при проверке таблицы:', dailyError.message);
  } else {
    console.log(`   Всего записей: ${dailyCount || 0}`);
    if (dailyCount === 0) {
      console.log('   ⚠️ ТАБЛИЦА ПУСТАЯ! Нужно запустить синхронизацию OZON Performance');
    }
  }

  // 3. Проверяем количество записей в VIEW
  console.log('\n3️⃣ Проверка данных в ozon_performance_summary...');
  const { count: viewCount, error: viewCountError } = await supabase
    .from('ozon_performance_summary')
    .select('*', { count: 'exact', head: true });

  if (viewCountError) {
    console.log('❌ Ошибка при подсчете:', viewCountError.message);
  } else {
    console.log(`   Всего записей в VIEW: ${viewCount || 0}`);
  }

  // 4. Проверяем данные за декабрь 2025
  console.log('\n4️⃣ Проверка данных за декабрь 2025 (период на скриншоте)...');
  const { data: decData, error: decError } = await supabase
    .from('ozon_performance_summary')
    .select('stat_date, campaign_name, sku, money_spent, total_orders, total_revenue')
    .gte('stat_date', '2025-12-01')
    .lte('stat_date', '2025-12-31')
    .order('stat_date', { ascending: false })
    .limit(5);

  if (decError) {
    console.log('❌ Ошибка при запросе:', decError.message);
  } else if (!decData || decData.length === 0) {
    console.log('   ⚠️ НЕТ ДАННЫХ за декабрь 2025!');
    console.log('   Это объясняет почему пользователь видит "Нет данных за выбранный период"');
  } else {
    console.log(`   ✅ Найдено записей за декабрь 2025: ${decData.length}`);
    console.log('\n   Примеры записей:');
    decData.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.stat_date} | ${row.campaign_name || 'No name'} | SKU: ${row.sku} | ₽${row.money_spent}`);
    });
  }

  // 5. Проверяем последние даты с данными
  console.log('\n5️⃣ Проверка последних дат с данными...');
  const { data: latestDates, error: latestError } = await supabase
    .from('ozon_performance_summary')
    .select('stat_date')
    .order('stat_date', { ascending: false })
    .limit(10);

  if (latestError) {
    console.log('❌ Ошибка при запросе:', latestError.message);
  } else if (!latestDates || latestDates.length === 0) {
    console.log('   ⚠️ Нет данных вообще');
  } else {
    console.log('   Последние даты с данными:');
    const uniqueDates = [...new Set(latestDates.map(d => d.stat_date))].slice(0, 5);
    uniqueDates.forEach((date, i) => {
      console.log(`   ${i + 1}. ${date}`);
    });
  }

  // 6. Проверяем все marketplace_id в таблице
  console.log('\n6️⃣ Проверка marketplace_id в данных...');
  const { data: marketplaces, error: mpError } = await supabase
    .from('ozon_performance_summary')
    .select('marketplace_id')
    .limit(100);

  if (mpError) {
    console.log('❌ Ошибка:', mpError.message);
  } else if (marketplaces && marketplaces.length > 0) {
    const uniqueMarketplaces = [...new Set(marketplaces.map(m => m.marketplace_id))];
    console.log(`   Найдено уникальных marketplace_id: ${uniqueMarketplaces.length}`);
    console.log(`   ID: ${uniqueMarketplaces.slice(0, 5).join(', ')}`);
  }

  // 7. Проверяем пользователей и их marketplaces
  console.log('\n7️⃣ Проверка пользователей и их marketplaces...');
  const { data: userMarketplaces, error: umError } = await supabase
    .from('marketplaces')
    .select('id, user_id, name, platform')
    .limit(5);

  if (umError) {
    console.log('❌ Ошибка:', umError.message);
  } else if (userMarketplaces && userMarketplaces.length > 0) {
    console.log('   Пользовательские marketplaces:');
    userMarketplaces.forEach((mp, i) => {
      console.log(`   ${i + 1}. ID: ${mp.id} | User: ${mp.user_id} | ${mp.platform || 'Unknown'} | ${mp.name || 'No name'}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ ПРОВЕРКА ЗАВЕРШЕНА\n');
}

checkViewAndData().catch(console.error);
