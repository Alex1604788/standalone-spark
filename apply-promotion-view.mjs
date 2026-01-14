#!/usr/bin/env node
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

console.log('🚀 Применяем VIEW миграцию для Аналитики Продвижения...\n');

// Читаем SQL файл
const sqlContent = readFileSync('supabase/migrations/20260114_create_ozon_performance_summary_view.sql', 'utf8');
console.log('📋 SQL загружен, размер:', sqlContent.length, 'байт\n');

// Применяем SQL напрямую через REST API
console.log('🔄 Выполняем SQL...');

try {
  // Используем SQL Editor API endpoint
  const queryUrl = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;

  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      query: sqlContent
    })
  });

  const responseText = await response.text();

  if (!response.ok) {
    console.log('❌ Не удалось выполнить через API');
    console.log('📋 Ответ:', responseText);
    console.log('\n💡 Примените миграцию вручную:\n');
    printManualInstructions();
    process.exit(1);
  }

  console.log('✅ SQL выполнен успешно!\n');

  // Проверяем что VIEW создался
  await checkView();

} catch (error) {
  console.error('❌ Ошибка:', error.message);
  console.log('\n💡 Примените миграцию вручную:\n');
  printManualInstructions();
  process.exit(1);
}

async function checkView() {
  console.log('📊 Проверяем VIEW...');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ozon_performance_summary?limit=1`, {
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ VIEW успешно создан и работает!');
      console.log('📊 Пример данных:', data.length > 0 ? 'есть' : 'нет данных');
      if (data.length > 0) {
        console.log('\n📋 Первая запись:');
        console.log(JSON.stringify(data[0], null, 2));
      }
    } else {
      const error = await response.text();
      console.log('❌ VIEW не найден:', error);
      console.log('\n💡 Примените миграцию вручную\n');
      printManualInstructions();
    }
  } catch (error) {
    console.log('❌ Ошибка при проверке VIEW:', error.message);
  }
}

function printManualInstructions() {
  console.log('═'.repeat(80));
  console.log('📋 ИНСТРУКЦИЯ ПО РУЧНОМУ ПРИМЕНЕНИЮ VIEW:');
  console.log('═'.repeat(80));
  console.log();
  console.log('1. Откройте Supabase SQL Editor:');
  console.log('   👉 https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
  console.log();
  console.log('2. Скопируйте ВЕСЬ текст из файла:');
  console.log('   supabase/migrations/20260114_create_ozon_performance_summary_view.sql');
  console.log();
  console.log('3. Вставьте в SQL Editor и нажмите "Run" (Ctrl+Enter)');
  console.log();
  console.log('4. Должно появиться: "Success. No rows returned"');
  console.log();
  console.log('5. Обновите страницу приложения (Ctrl+F5)');
  console.log();
  console.log('═'.repeat(80));
  console.log();
}
