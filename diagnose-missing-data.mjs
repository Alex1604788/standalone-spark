#!/usr/bin/env node

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

console.log('🔍 ДИАГНОСТИКА: Проверяем почему данные не появились\n');
console.log('='.repeat(80));

async function checkView() {
  console.log('\n📊 ШАГ 1: Проверяем существование VIEW ozon_performance_summary...');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_summary?limit=1`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ VIEW существует и доступен');
      console.log('📊 Первая запись:', data.length > 0 ? 'есть' : 'нет');
      if (data.length > 0) {
        console.log('\nПример данных из VIEW:');
        console.log(JSON.stringify(data[0], null, 2));
      }
      return true;
    } else {
      const error = await response.text();
      console.log('❌ VIEW НЕ СУЩЕСТВУЕТ или недоступен');
      console.log('Ошибка:', error);
      return false;
    }
  } catch (error) {
    console.log('❌ Ошибка при проверке VIEW:', error.message);
    return false;
  }
}

async function checkBaseTable() {
  console.log('\n📊 ШАГ 2: Проверяем базовую таблицу ozon_performance_daily...');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_daily?select=count`, {
      method: 'HEAD',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('content-range')?.split('/')[1] || '0';
    console.log(`📊 Количество записей в ozon_performance_daily: ${count}`);

    if (count === '0') {
      console.log('❌ ТАБЛИЦА ПУСТАЯ! Данных нет.');
      return false;
    }

    // Получаем примеры данных
    const dataResponse = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_daily?select=*&limit=3&order=stat_date.desc`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });

    if (dataResponse.ok) {
      const data = await dataResponse.json();
      console.log('✅ В таблице есть данные');
      console.log('\nПоследние 3 записи:');
      data.forEach((row, i) => {
        console.log(`\n  Запись ${i + 1}:`);
        console.log(`    Дата: ${row.stat_date}`);
        console.log(`    SKU: ${row.sku}`);
        console.log(`    Кампания: ${row.campaign_name}`);
        console.log(`    orders: ${row.orders}, orders_model: ${row.orders_model}`);
        console.log(`    revenue: ${row.revenue}, revenue_model: ${row.revenue_model}`);
        console.log(`    money_spent: ${row.money_spent}`);
      });
    }

    return true;
  } catch (error) {
    console.log('❌ Ошибка при проверке таблицы:', error.message);
    return false;
  }
}

async function checkViewCount() {
  console.log('\n📊 ШАГ 3: Считаем записи через VIEW...');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_summary?select=count`, {
      method: 'HEAD',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'count=exact'
      }
    });

    const count = response.headers.get('content-range')?.split('/')[1] || '0';
    console.log(`📊 Количество записей через VIEW: ${count}`);

    if (count === '0') {
      console.log('⚠️ VIEW пустой, но это может быть из-за пустой базовой таблицы');
    }

    return parseInt(count);
  } catch (error) {
    console.log('❌ Ошибка при подсчёте через VIEW:', error.message);
    return 0;
  }
}

async function checkAggregatedData() {
  console.log('\n📊 ШАГ 4: Проверяем агрегированные данные...');

  try {
    // Проверяем суммы через VIEW
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/ozon_performance_summary?select=stat_date,total_orders.sum(),total_revenue.sum(),money_spent.sum()&limit=10&order=stat_date.desc`,
      {
        headers: {
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Агрегированные данные доступны');
      console.log('\nПример агрегации по датам:');
      console.table(data);
    }
  } catch (error) {
    console.log('❌ Ошибка при получении агрегированных данных:', error.message);
  }
}

async function checkPermissions() {
  console.log('\n📊 ШАГ 5: Проверяем права доступа...');

  try {
    // Пробуем с anon key
    const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ';

    const response = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_summary?limit=1`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`
      }
    });

    if (response.ok) {
      console.log('✅ VIEW доступен для authenticated пользователей (anon key работает)');
    } else {
      const error = await response.text();
      console.log('❌ VIEW недоступен для authenticated пользователей');
      console.log('Ошибка:', error);
      console.log('\n💡 Возможно не был выполнен: GRANT SELECT ON public.ozon_performance_summary TO authenticated;');
    }
  } catch (error) {
    console.log('❌ Ошибка при проверке прав:', error.message);
  }
}

// Главная функция
async function main() {
  const viewExists = await checkView();

  if (!viewExists) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ ПРОБЛЕМА: VIEW не был создан!');
    console.log('='.repeat(80));
    console.log('\n📋 РЕШЕНИЕ:');
    console.log('1. Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
    console.log('2. Скопируйте содержимое файла VIEW_TO_APPLY.sql');
    console.log('3. Вставьте в SQL Editor и нажмите Run');
    console.log('\nПосле этого данные появятся в приложении.\n');
    return;
  }

  const tableHasData = await checkBaseTable();

  if (!tableHasData) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ ПРОБЛЕМА: Базовая таблица пустая!');
    console.log('='.repeat(80));
    console.log('\n📋 РЕШЕНИЕ:');
    console.log('Нужно запустить синхронизацию данных с OZON.');
    console.log('Используйте один из скриптов:');
    console.log('  - ./run-sync.sh');
    console.log('  - ./trigger-sync.sh');
    console.log('\nИли настройте автоматическую синхронизацию согласно ИНСТРУКЦИЯ_НАСТРОЙКИ_СИНХРОНИЗАЦИИ.md\n');
    return;
  }

  const viewCount = await checkViewCount();
  await checkAggregatedData();
  await checkPermissions();

  console.log('\n' + '='.repeat(80));
  console.log('✅ ИТОГОВАЯ ДИАГНОСТИКА');
  console.log('='.repeat(80));

  if (viewExists && tableHasData && viewCount > 0) {
    console.log('\n✅ ВСЁ РАБОТАЕТ ПРАВИЛЬНО!');
    console.log('\nВозможные причины, почему данные не видны в приложении:');
    console.log('1. Кэш браузера - попробуйте Ctrl+F5 (жёсткое обновление)');
    console.log('2. Фильтры в приложении - проверьте выбранные даты и фильтры');
    console.log('3. Проблема с правами - проверьте что пользователь авторизован');
    console.log('4. Проблема в коде приложения - проверьте консоль браузера (F12)');
  } else {
    console.log('\n⚠️ Обнаружены проблемы - смотрите детали выше');
  }

  console.log('\n');
}

main().catch(console.error);
