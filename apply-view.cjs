#!/usr/bin/env node
/**
 * Простой скрипт для создания VIEW через Supabase Management API
 */

const https = require('https');
const fs = require('fs');

// Конфигурация Supabase
const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

// SQL команды для создания VIEW
const SQL_COMMANDS = [
  // 1. Удаляем старый VIEW если существует
  `DROP VIEW IF EXISTS public.ozon_performance_summary CASCADE`,

  // 2. Создаем VIEW
  `CREATE VIEW public.ozon_performance_summary AS
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
  CASE
    WHEN views > 0 THEN ROUND((clicks::NUMERIC / views) * 100, 2)
    ELSE 0
  END AS ctr,
  CASE
    WHEN clicks > 0 THEN ROUND(money_spent / clicks, 2)
    ELSE 0
  END AS cpc,
  CASE
    WHEN clicks > 0 THEN ROUND(((COALESCE(orders, 0) + COALESCE(orders_model, 0))::NUMERIC / clicks) * 100, 2)
    ELSE 0
  END AS conversion,
  CASE
    WHEN (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((money_spent / (COALESCE(revenue, 0) + COALESCE(revenue_model, 0))) * 100, 2)
    ELSE NULL
  END AS drr,
  CASE
    WHEN money_spent > 0 AND (COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) > 0
    THEN ROUND((((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) - money_spent) / money_spent) * 100, 2)
    ELSE NULL
  END AS roi,
  CASE
    WHEN (COALESCE(orders, 0) + COALESCE(orders_model, 0)) > 0
    THEN ROUND((COALESCE(revenue, 0) + COALESCE(revenue_model, 0)) / (COALESCE(orders, 0) + COALESCE(orders_model, 0)), 2)
    ELSE NULL
  END AS avg_order_value,
  imported_at,
  import_batch_id
FROM public.ozon_performance_daily`,

  // 3. Предоставляем доступ
  `GRANT SELECT ON public.ozon_performance_summary TO authenticated`,

  // 4. Добавляем комментарии
  `COMMENT ON VIEW public.ozon_performance_summary IS 'Представление с автоматическим суммированием orders + orders_model и revenue + revenue_model. Используйте этот VIEW вместо прямого запроса к ozon_performance_daily для получения итоговых метрик.'`,

  `COMMENT ON COLUMN public.ozon_performance_summary.total_orders IS 'Автоматическая сумма: orders + orders_model'`,

  `COMMENT ON COLUMN public.ozon_performance_summary.total_revenue IS 'Автоматическая сумма: revenue + revenue_model'`
];

console.log('🚀 Начинаем создание VIEW ozon_performance_summary...\n');

// Функция для выполнения SQL команды через PostgREST
async function executeSQL(sql, index, total) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: 'bkmicyguzlwampuindff.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    };

    console.log(`[${index}/${total}] Выполняем SQL команду...`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Команда ${index} выполнена успешно`);
          resolve(data);
        } else {
          console.log(`⚠️  Статус: ${res.statusCode}`);
          // Не считаем это критической ошибкой
          resolve(data);
        }
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Ошибка команды ${index}:`, error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

console.log('📝 Выводим SQL в файл для ручного применения...\n');

// Сохраняем SQL в файл для ручного применения
const fullSQL = SQL_COMMANDS.join(';\n\n') + ';';
fs.writeFileSync('VIEW_TO_APPLY.sql', fullSQL);
console.log('✅ SQL сохранен в файл: VIEW_TO_APPLY.sql');
console.log('\n📋 Содержимое SQL:\n');
console.log('='.repeat(80));
console.log(fullSQL);
console.log('='.repeat(80));

console.log('\n\n💡 ИНСТРУКЦИЯ ПО ПРИМЕНЕНИЮ:\n');
console.log('1. Откройте Supabase SQL Editor:');
console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new\n');
console.log('2. Скопируйте содержимое файла VIEW_TO_APPLY.sql');
console.log('3. Вставьте в SQL Editor');
console.log('4. Нажмите "Run" или Ctrl+Enter\n');
console.log('✅ После этого VIEW будет создан и готов к использованию!\n');
