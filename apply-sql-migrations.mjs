#!/usr/bin/env node

/**
 * Применение SQL миграций для исправления проблемы лимита 1000 записей
 * Создает функции:
 * - get_campaign_performance_aggregated
 * - get_product_performance_by_campaign
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Применение SQL миграций для исправления проблемы лимита 1000 записей\n');

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

// Убираем комментарии и лишние пробелы
const cleanSql = sqlContent
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')
  .replace(/\n\s*\n/g, '\n')
  .trim();

console.log('📋 SQL МИГРАЦИИ ДЛЯ ПРИМЕНЕНИЯ В SUPABASE DASHBOARD:');
console.log('='.repeat(80));
console.log('\n📌 ИНСТРУКЦИЯ:');
console.log('   1. Откройте https://supabase.com/dashboard');
console.log('   2. Выберите ваш проект (bkmicyguzlwampuindff)');
console.log('   3. Перейдите в SQL Editor (левое меню)');
console.log('   4. Создайте новый query');
console.log('   5. Скопируйте и вставьте SQL ниже');
console.log('   6. Нажмите "Run" (или Ctrl+Enter)');
console.log('   7. Дождитесь сообщения "Success. No rows returned"\n');

console.log('='.repeat(80));
console.log('-- SQL ДЛЯ КОПИРОВАНИЯ В SUPABASE:');
console.log('='.repeat(80));
console.log(cleanSql);
console.log('='.repeat(80));

console.log('\n✅ ПОСЛЕ ПРИМЕНЕНИЯ SQL проверьте, что функции созданы:');
console.log('\nВыполните в SQL Editor:');
console.log('─'.repeat(80));
console.log(`
SELECT
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'get_campaign_performance_aggregated',
    'get_product_performance_by_campaign'
  );
`);
console.log('─'.repeat(80));

console.log('\n🧪 ТЕСТИРОВАНИЕ функций:');
console.log('\nЗамените YOUR_MARKETPLACE_ID на реальный UUID из таблицы marketplaces:');
console.log('─'.repeat(80));
console.log(`
-- Тест функции агрегации кампаний
SELECT
  campaign_name,
  total_money_spent,
  days_with_expenses,
  sku_count,
  total_orders,
  total_revenue
FROM get_campaign_performance_aggregated(
  'YOUR_MARKETPLACE_ID'::uuid,
  '2025-12-01'::date,
  '2025-12-31'::date
)
ORDER BY total_money_spent DESC
LIMIT 5;
`);
console.log('─'.repeat(80));

console.log('\n📝 СОЗДАЁМ ФАЙЛ С ГОТОВЫМ SQL...');

// Создаём файл с готовым SQL для применения
const outputPath = join(__dirname, 'MIGRATION_TO_APPLY.sql');
try {
  const fs = await import('fs');
  fs.writeFileSync(outputPath, cleanSql, 'utf-8');
  console.log(`✅ Создан файл: ${outputPath}`);
  console.log('   Вы можете открыть его и скопировать SQL для применения в Supabase\n');
} catch (error) {
  console.error('⚠️  Не удалось создать файл:', error.message);
}

console.log('\n' + '='.repeat(80));
console.log('📚 ЧТО ДАЛЬШЕ:');
console.log('='.repeat(80));
console.log('1. ✅ Скопируйте SQL выше в Supabase SQL Editor');
console.log('2. ✅ Выполните SQL (Run или Ctrl+Enter)');
console.log('3. ✅ Проверьте, что функции созданы (запрос выше)');
console.log('4. ✅ Протестируйте функции (тестовый запрос выше)');
console.log('5. ✅ Перезагрузите страницу аналитики в приложении');
console.log('6. ✅ Проверьте логи в Chrome DevTools (F12 -> Console)');
console.log('7. ✅ Убедитесь, что данные загружаются без лимита 1000 записей\n');

console.log('💡 ПОДСКАЗКА: Функции уже используются в коде React!');
console.log('   После применения SQL миграций всё должно заработать автоматически.\n');
