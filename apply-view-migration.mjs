#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function applyViewMigration() {
  console.log('\n🚀 ПРИМЕНЕНИЕ VIEW МИГРАЦИИ\n');
  console.log('='.repeat(60));

  try {
    // Читаем SQL из файла миграции
    console.log('\n1️⃣ Чтение файла миграции...');
    const migrationSQL = readFileSync('./supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql', 'utf8');
    console.log('✅ Файл миграции прочитан');

    // Выполняем SQL
    console.log('\n2️⃣ Выполнение SQL запроса...');
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: migrationSQL
    });

    // Если RPC не работает, пробуем напрямую через REST API
    if (error && error.message.includes('function public.exec_sql')) {
      console.log('⚠️ RPC недоступен, применяю VIEW напрямую через отдельные запросы...');

      // Удаляем старый VIEW
      console.log('\n   Удаление старого VIEW...');
      const { error: dropError } = await supabase.rpc('exec_sql', {
        query: 'DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE'
      });

      // Создаём VIEW через prямой SQL запрос
      console.log('\n   Создание VIEW...');
      const createViewSQL = `
CREATE OR REPLACE VIEW public.ozon_performance_summary AS
SELECT
  id,
  marketplace_id,
  stat_date,
  sku,
  offer_id,
  campaign_id,
  campaign_name,
  campaign_type,
  money_spent,
  views,
  clicks,
  orders,
  orders_model,
  revenue,
  revenue_model,
  add_to_cart,
  avg_bill,
  (COALESCE(orders, 0) + COALESCE(orders_model, 0)) AS total_orders,
  (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) AS total_revenue,
  CASE WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2) ELSE 0 END AS ctr,
  CASE WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2) ELSE 0 END AS cpc,
  CASE WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2) ELSE 0 END AS conversion,
  CASE WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0 THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2) ELSE NULL END AS drr,
  CASE WHEN money_spent > 0 AND (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0 THEN ROUND((((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) - money_spent) / money_spent) * 100, 2) ELSE NULL END AS roi,
  CASE WHEN (COALESCE(orders, 0) + COALESCE(orders_model, 0)) > 0 THEN ROUND((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) / (COALESCE(orders, 0) + COALESCE(orders_model, 0)), 2) ELSE NULL END AS avg_order_value,
  imported_at,
  import_batch_id
FROM public.ozon_performance_daily;
`;

      // Используем fetch напрямую к REST API
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: createViewSQL })
      });

      if (!response.ok) {
        console.log('❌ Не удалось применить через API, попробуйте вручную через Supabase Dashboard');
        console.log('\n📋 ИНСТРУКЦИЯ ДЛЯ РУЧНОГО ПРИМЕНЕНИЯ:\n');
        console.log('1. Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
        console.log('2. Скопируйте содержимое файла: supabase/migrations/20260112000000_create_ozon_performance_summary_view.sql');
        console.log('3. Вставьте в SQL Editor и нажмите RUN');
        process.exit(1);
      }
    }

    if (error) {
      console.log('❌ Ошибка при применении миграции:', error.message);
      console.log('\n📋 АЛЬТЕРНАТИВНЫЙ СПОСОБ:\n');
      console.log('Выполните SQL вручную в Supabase Dashboard:');
      console.log('https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
      process.exit(1);
    }

    console.log('✅ VIEW успешно применен!');

    // Проверяем что VIEW работает
    console.log('\n3️⃣ Проверка VIEW...');
    const { count, error: checkError } = await supabase
      .from('ozon_performance_summary')
      .select('*', { count: 'exact', head: true });

    if (checkError) {
      console.log('❌ Ошибка при проверке VIEW:', checkError.message);
      process.exit(1);
    }

    console.log(`✅ VIEW работает! Всего записей: ${count || 0}`);

    if (count === 0) {
      console.log('\n⚠️ ВНИМАНИЕ: VIEW создан, но данных нет!');
      console.log('   Возможные причины:');
      console.log('   1. Таблица ozon_performance_daily пустая');
      console.log('   2. Нужно запустить синхронизацию OZON Performance');
      console.log('   3. Данные есть, но для другого marketplace_id');
    } else {
      console.log('\n🎉 ВСЁ ГОТОВО! Данные должны появиться на странице Аналитики Продвижения');
    }

  } catch (err) {
    console.error('❌ Непредвиденная ошибка:', err);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ СКРИПТ ЗАВЕРШЕН\n');
}

applyViewMigration().catch(console.error);
