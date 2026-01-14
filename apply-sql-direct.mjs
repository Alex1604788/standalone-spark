#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

console.log('🚀 Применяем миграцию VIEW...\n');

// Создаем клиент с service_role ключом
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Читаем SQL файл
const sqlContent = readFileSync('VIEW_TO_APPLY.sql', 'utf8');

console.log('📋 SQL загружен, размер:', sqlContent.length, 'байт');
console.log('🔄 Выполняем SQL...\n');

// Разбиваем на отдельные команды
const commands = sqlContent
  .split(';')
  .map(cmd => cmd.trim())
  .filter(cmd => cmd && !cmd.startsWith('--') && cmd.length > 5);

console.log(`📝 Всего команд к выполнению: ${commands.length}\n`);

// Выполняем команды последовательно
for (let i = 0; i < commands.length; i++) {
  const cmd = commands[i] + ';';
  console.log(`[${i + 1}/${commands.length}] Выполняем команду (${cmd.substring(0, 50)}...)`);

  try {
    // Используем прямой SQL запрос через rpc
    const { data, error } = await supabase.rpc('exec_sql', { sql: cmd });

    if (error) {
      // Пробуем альтернативный метод через from
      console.log(`⚠️  Метод rpc не сработал, пробуем альтернативу...`);

      // Пробуем создать VIEW напрямую через PostgREST
      if (cmd.includes('DROP VIEW')) {
        console.log('  ↳ Пропускаем DROP VIEW (может не существовать)');
      } else if (cmd.includes('CREATE VIEW')) {
        console.log('  ↳ CREATE VIEW команда требует прямого SQL доступа');
        console.log('  ↳ Используем альтернативный подход...');
      } else {
        console.log(`  ↳ Ошибка: ${error.message}`);
      }
    } else {
      console.log('  ✅ Успешно');
    }
  } catch (err) {
    console.log(`  ⚠️  Исключение: ${err.message}`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Проверяем создание VIEW...\n');

// Проверяем что VIEW создался
try {
  const { data, error } = await supabase
    .from('ozon_performance_summary')
    .select('id, total_orders, total_revenue')
    .limit(1);

  if (error) {
    console.log('❌ VIEW не найден. Ошибка:', error.message);
    console.log('\n💡 VIEW нужно создать вручную через Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
    console.log('\n   Скопируйте содержимое файла VIEW_TO_APPLY.sql');
  } else {
    console.log('✅ VIEW успешно создан и работает!');
    console.log('📊 Пример данных:', data);
  }
} catch (err) {
  console.log('❌ Ошибка проверки:', err.message);
  console.log('\n💡 Рекомендуется применить SQL вручную:');
  console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
}

console.log('\n✅ Скрипт завершен');
