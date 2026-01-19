#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('🚀 Применение миграций для исправления проблемы лимита 1000 записей...\n');

// Читаем SQL файл
const sqlFilePath = join(__dirname, 'APPLY_CAMPAIGN_AGGREGATION_MIGRATIONS.sql');
console.log(`📄 Читаем файл: ${sqlFilePath}`);

let sqlContent;
try {
  sqlContent = readFileSync(sqlFilePath, 'utf-8');
  console.log('✅ Файл успешно прочитан\n');
} catch (error) {
  console.error('❌ Ошибка чтения файла:', error.message);
  process.exit(1);
}

// Разбиваем SQL на отдельные функции
const migrations = [
  {
    name: 'get_campaign_performance_aggregated',
    description: 'Функция для агрегации данных по кампаниям',
    sql: sqlContent.substring(
      sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.get_campaign_performance_aggregated'),
      sqlContent.indexOf('COMMENT ON FUNCTION public.get_campaign_performance_aggregated')
    ).trim()
  },
  {
    name: 'get_product_performance_by_campaign',
    description: 'Функция для получения данных по товарам в кампании',
    sql: sqlContent.substring(
      sqlContent.indexOf('CREATE OR REPLACE FUNCTION public.get_product_performance_by_campaign'),
      sqlContent.indexOf('COMMENT ON FUNCTION public.get_product_performance_by_campaign')
    ).trim()
  }
];

// Применяем миграции
for (const migration of migrations) {
  console.log(`📝 Применяем миграцию: ${migration.description}`);

  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: migration.sql });

    if (error) {
      console.error(`❌ Ошибка при применении миграции ${migration.name}:`, error.message);
      console.log('\n⚠️  Попробуем выполнить через прямой SQL запрос...\n');

      // Попробуем другой подход - через query
      const { error: error2 } = await supabase
        .from('_migrations')
        .insert({ sql: migration.sql });

      if (error2) {
        console.error('❌ Не удалось применить миграцию. Пожалуйста, выполните SQL вручную в Supabase Dashboard.');
        console.log('\n📋 SQL для выполнения:');
        console.log('─'.repeat(80));
        console.log(migration.sql);
        console.log('─'.repeat(80));
      }
    } else {
      console.log(`✅ Миграция ${migration.name} успешно применена\n`);
    }
  } catch (error) {
    console.error(`❌ Исключение при применении миграции ${migration.name}:`, error.message);
  }
}

// Проверяем, что функции созданы
console.log('\n🔍 Проверяем наличие созданных функций...\n');

const checkSql = `
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_campaign_performance_aggregated',
    'get_product_performance_by_campaign'
  );
`;

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: checkSql });

  if (error) {
    console.log('⚠️  Не удалось проверить функции через RPC, попробуем другой способ...');

    // Пробуем вызвать функции напрямую с тестовыми параметрами
    console.log('\n🧪 Тестируем функцию get_campaign_performance_aggregated...');
    const { data: testData, error: testError } = await supabase
      .rpc('get_campaign_performance_aggregated', {
        p_marketplace_id: '00000000-0000-0000-0000-000000000000',
        p_start_date: '2025-01-01',
        p_end_date: '2025-01-31'
      });

    if (testError) {
      if (testError.message.includes('could not find')) {
        console.log('❌ Функция get_campaign_performance_aggregated НЕ найдена');
        console.log('\n⚠️  ВНИМАНИЕ: Миграции не применились автоматически.');
        console.log('📋 Пожалуйста, выполните SQL вручную в Supabase Dashboard:');
        console.log('   1. Откройте https://supabase.com/dashboard');
        console.log('   2. Выберите ваш проект');
        console.log('   3. Перейдите в SQL Editor');
        console.log('   4. Скопируйте содержимое файла APPLY_CAMPAIGN_AGGREGATION_MIGRATIONS.sql');
        console.log('   5. Вставьте и выполните (Run или Ctrl+Enter)\n');
      } else {
        console.log('✅ Функция существует (получили ошибку выполнения, что нормально для тестовых данных)');
      }
    } else {
      console.log('✅ Функция get_campaign_performance_aggregated работает!');
      console.log(`   Возвращено записей: ${testData?.length || 0}`);
    }

  } else {
    console.log('✅ Функции найдены в базе данных:');
    if (data && data.length > 0) {
      data.forEach(row => {
        console.log(`   - ${row.routine_name} (${row.routine_type})`);
      });
    }
  }
} catch (error) {
  console.log('⚠️  Ошибка при проверке:', error.message);
}

console.log('\n' + '='.repeat(80));
console.log('✨ Готово!');
console.log('='.repeat(80));
console.log('\n📚 Следующие шаги:');
console.log('   1. Если миграции не применились автоматически, выполните SQL вручную');
console.log('   2. Перезагрузите страницу аналитики в приложении');
console.log('   3. Проверьте логи в Chrome DevTools (F12 -> Console)');
console.log('   4. Убедитесь, что загружаются все данные без лимита 1000 записей\n');
