#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDataAvailability() {
  console.log('🔍 Проверяем доступность данных в ozon_performance_summary...\n');

  // 1. Получаем marketplace_id
  const { data: marketplaces, error: marketplacesError } = await supabase
    .from('marketplaces')
    .select('id, user_id, name')
    .limit(5);

  if (marketplacesError) {
    console.error('❌ Ошибка получения marketplaces:', marketplacesError);
    return;
  }

  console.log(`✅ Найдено marketplaces: ${marketplaces?.length || 0}`);
  if (marketplaces && marketplaces.length > 0) {
    console.log('📊 Примеры:', marketplaces.map(m => ({ id: m.id, name: m.name })));
  }

  if (!marketplaces || marketplaces.length === 0) {
    console.log('⚠️  Нет marketplaces в базе данных');
    return;
  }

  const marketplace_id = marketplaces[0].id;
  console.log(`\n🎯 Используем marketplace_id: ${marketplace_id}\n`);

  // 2. Проверяем данные в ozon_performance_summary
  const { data: allData, error: allDataError } = await supabase
    .from('ozon_performance_summary')
    .select('marketplace_id, stat_date, campaign_id, campaign_name, sku')
    .eq('marketplace_id', marketplace_id)
    .order('stat_date', { ascending: false })
    .limit(10);

  if (allDataError) {
    console.error('❌ Ошибка загрузки данных из ozon_performance_summary:', allDataError);
    return;
  }

  console.log(`✅ Загружено записей: ${allData?.length || 0}`);

  if (!allData || allData.length === 0) {
    console.log('⚠️  Нет данных в ozon_performance_summary для этого marketplace');

    // Проверяем все marketplace_id в таблице
    const { data: allMarketplaceIds } = await supabase
      .from('ozon_performance_summary')
      .select('marketplace_id')
      .limit(5);

    console.log('\n🔍 Marketplace IDs в таблице ozon_performance_summary:');
    if (allMarketplaceIds && allMarketplaceIds.length > 0) {
      const uniqueIds = [...new Set(allMarketplaceIds.map(m => m.marketplace_id))];
      console.log('  ', uniqueIds);
    } else {
      console.log('   ❌ Нет данных вообще в таблице ozon_performance_summary');
    }
    return;
  }

  // 3. Получаем статистику по датам
  const { data: dateStats, error: dateStatsError } = await supabase
    .from('ozon_performance_summary')
    .select('stat_date')
    .eq('marketplace_id', marketplace_id)
    .order('stat_date', { ascending: false });

  if (dateStatsError) {
    console.error('❌ Ошибка получения статистики дат:', dateStatsError);
    return;
  }

  const dates = dateStats?.map(d => d.stat_date) || [];
  const minDate = dates[dates.length - 1];
  const maxDate = dates[0];

  console.log('\n📅 Доступные даты:');
  console.log(`   Минимальная дата: ${minDate}`);
  console.log(`   Максимальная дата: ${maxDate}`);
  console.log(`   Всего записей: ${dates.length}`);

  // 4. Проверяем, есть ли данные за декабрь 2025
  const { data: decemberData, error: decemberError } = await supabase
    .from('ozon_performance_summary')
    .select('stat_date, campaign_name, sku')
    .eq('marketplace_id', marketplace_id)
    .gte('stat_date', '2025-12-01')
    .lte('stat_date', '2025-12-31')
    .limit(10);

  console.log('\n🗓️  Данные за декабрь 2025:');
  if (decemberError) {
    console.error('   ❌ Ошибка:', decemberError);
  } else if (!decemberData || decemberData.length === 0) {
    console.log('   ⚠️  НЕТ ДАННЫХ за декабрь 2025');
    console.log('   💡 Это объясняет, почему на странице показывается "Нет данных за выбранный период"');
  } else {
    console.log(`   ✅ Найдено ${decemberData.length} записей`);
    console.log('   📊 Примеры:', decemberData.slice(0, 3));
  }

  // 5. Проверяем последние доступные данные
  console.log('\n📊 Последние 5 дат с данными:');
  const latestDates = [...new Set(dates)].slice(0, 5);
  latestDates.forEach(date => {
    console.log(`   - ${date}`);
  });

  // 6. Тестируем SQL функцию
  console.log('\n🧪 Тестируем SQL функцию get_campaign_performance_aggregated...');

  // Используем период, где точно есть данные
  const testStartDate = minDate;
  const testEndDate = maxDate;

  const { data: sqlResult, error: sqlError } = await supabase
    .rpc('get_campaign_performance_aggregated', {
      p_marketplace_id: marketplace_id,
      p_start_date: testStartDate,
      p_end_date: testEndDate,
    });

  if (sqlError) {
    console.error('❌ Ошибка вызова SQL функции:', sqlError);
  } else {
    console.log(`✅ SQL функция вернула ${sqlResult?.length || 0} кампаний`);
    if (sqlResult && sqlResult.length > 0) {
      console.log('📊 Первая кампания:', {
        name: sqlResult[0].campaign_name,
        spent: sqlResult[0].total_money_spent,
        products: sqlResult[0].sku_count
      });
    }
  }

  console.log('\n✨ Проверка завершена!');
}

checkDataAvailability().catch(console.error);
