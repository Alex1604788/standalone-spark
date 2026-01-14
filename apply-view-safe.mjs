#!/usr/bin/env node
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

console.log('🚀 Применяем VIEW миграцию через HTTP API...\n');

// Читаем SQL файл
const sqlContent = readFileSync('VIEW_TO_APPLY.sql', 'utf8');
console.log('📋 SQL загружен, размер:', sqlContent.length, 'байт\n');

// Пробуем выполнить через pg_meta API
console.log('🔄 Выполняем SQL через Supabase API...');

try {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      query: sqlContent
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.log('❌ Не удалось выполнить через API:', error);
    console.log('\n💡 VIEW нужно создать вручную через Supabase Dashboard\n');
    printManualInstructions();
    process.exit(1);
  }

  console.log('✅ SQL выполнен успешно!\n');

  // Проверяем что VIEW создался
  await checkView();

} catch (error) {
  console.error('❌ Ошибка:', error.message);
  console.log('\n💡 VIEW нужно создать вручную через Supabase Dashboard\n');
  printManualInstructions();
  process.exit(1);
}

async function checkView() {
  console.log('📊 Проверяем создание VIEW...');

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
      console.log('📊 Найдено записей:', data.length > 0 ? 'есть данные' : 'нет данных');
    } else {
      throw new Error('VIEW не найден');
    }
  } catch (error) {
    console.log('❌ VIEW не найден:', error.message);
    console.log('\n💡 VIEW нужно создать вручную\n');
    printManualInstructions();
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
  console.log('2. Скопируйте ВЕСЬ текст из файла VIEW_TO_APPLY.sql');
  console.log('   (файл находится в корне проекта)');
  console.log();
  console.log('3. Вставьте в SQL Editor');
  console.log();
  console.log('4. Нажмите "Run" или Ctrl+Enter');
  console.log();
  console.log('5. Должно появиться: "Success. No rows returned"');
  console.log();
  console.log('═'.repeat(80));
  console.log();
}
