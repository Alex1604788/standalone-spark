#!/usr/bin/env node

/**
 * Проверка, что SQL функции созданы и работают
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk";

console.log('🔍 Проверяем SQL функции...\n');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (...args) => {
      // Добавляем таймаут
      return Promise.race([
        fetch(...args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        )
      ]);
    }
  }
});

// Проверяем наличие функций через SQL запрос
console.log('📋 Проверяем наличие функций в БД...\n');

const checkQuery = `
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_campaign_performance_aggregated',
    'get_product_performance_by_campaign'
  )
ORDER BY routine_name;
`;

try {
  // Используем from для выполнения сырого SQL
  const { data, error } = await supabase.rpc('query', { sql: checkQuery });

  if (error) {
    console.log('⚠️  Не удалось выполнить проверочный запрос через RPC');
    console.log('   Попробуем другой метод...\n');

    // Пробуем просто вызвать функцию
    const testResult = await supabase.rpc('get_campaign_performance_aggregated', {
      p_marketplace_id: '00000000-0000-0000-0000-000000000000',
      p_start_date: '2026-01-01',
      p_end_date: '2026-01-16'
    });

    if (testResult.error) {
      if (testResult.error.message.includes('does not exist') ||
          testResult.error.message.includes('не существует')) {
        console.log('❌ Функция get_campaign_performance_aggregated НЕ НАЙДЕНА\n');
        console.log('📝 Нужно применить SQL миграции вручную:\n');
        console.log('   1. Откройте: https://supabase.com/dashboard/project/bkmicyguzlwampuindff/editor');
        console.log('   2. Перейдите в SQL Editor');
        console.log('   3. Создайте New Query');
        console.log('   4. Откройте файл APPLY_SQL_NOW.sql');
        console.log('   5. Скопируйте ВСЁ содержимое');
        console.log('   6. Вставьте в редактор');
        console.log('   7. Нажмите RUN или Ctrl+Enter\n');
      } else {
        console.log('✅ Функция get_campaign_performance_aggregated СОЗДАНА');
        console.log('   (вызов с тестовыми данными вернул ожидаемую ошибку)\n');
      }
    } else {
      console.log('✅ Функция get_campaign_performance_aggregated СОЗДАНА И РАБОТАЕТ\n');
      console.log('📊 Результат тестового вызова:', testResult.data);
    }

    // Проверяем вторую функцию
    const testResult2 = await supabase.rpc('get_product_performance_by_campaign', {
      p_marketplace_id: '00000000-0000-0000-0000-000000000000',
      p_campaign_id: 'test',
      p_start_date: '2026-01-01',
      p_end_date: '2026-01-16'
    });

    if (testResult2.error) {
      if (testResult2.error.message.includes('does not exist') ||
          testResult2.error.message.includes('не существует')) {
        console.log('❌ Функция get_product_performance_by_campaign НЕ НАЙДЕНА\n');
      } else {
        console.log('✅ Функция get_product_performance_by_campaign СОЗДАНА\n');
      }
    } else {
      console.log('✅ Функция get_product_performance_by_campaign СОЗДАНА И РАБОТАЕТ\n');
    }

  } else {
    console.log('✅ Запрос выполнен успешно!\n');
    console.log('📊 Найденные функции:');
    data.forEach(row => {
      console.log(`   - ${row.routine_name} (${row.routine_type})`);
    });
    console.log();
  }

  console.log('✨ Проверка завершена!\n');

} catch (err) {
  console.error('❌ Ошибка при проверке:', err.message);
  console.log('\n💡 Рекомендуется применить SQL вручную через Supabase Dashboard\n');
}
