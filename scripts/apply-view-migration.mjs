#!/usr/bin/env node

/**
 * Script to apply the ozon_performance_summary VIEW migration
 *
 * Usage:
 *   node scripts/apply-view-migration.mjs
 *
 * Environment variables required:
 *   DATABASE_URL - PostgreSQL connection string
 *   or
 *   SUPABASE_DB_URL - Supabase database URL
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get database URL from environment
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('❌ Ошибка: DATABASE_URL или SUPABASE_DB_URL не установлен');
  console.error('');
  console.error('📝 Установите переменную окружения:');
  console.error('   export DATABASE_URL="postgresql://postgres:[password]@[host]:5432/postgres"');
  console.error('');
  console.error('💡 Или примените миграцию вручную через Supabase SQL Editor:');
  console.error('   https://supabase.com/dashboard/project/your-project-id/sql/new');
  console.error('');
  console.error('   Файл миграции:');
  console.error('   supabase/migrations/20260115000000_create_ozon_performance_summary_view.sql');
  process.exit(1);
}

async function applyMigration() {
  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    console.log('🔌 Подключение к базе данных...');
    await client.connect();
    console.log('✅ Подключено');
    console.log('');

    // Read migration file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260115000000_create_ozon_performance_summary_view.sql');
    console.log('📖 Чтение миграции...');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    console.log('✅ Миграция загружена');
    console.log('');

    // Apply migration
    console.log('🚀 Применение миграции...');
    await client.query(migrationSql);
    console.log('✅ Миграция успешно применена!');
    console.log('');

    // Verify VIEW exists
    console.log('🔍 Проверка создания VIEW...');
    const checkResult = await client.query('SELECT COUNT(*) FROM ozon_performance_summary LIMIT 1');
    console.log('✅ VIEW создан и работает');
    console.log('');

    // Get sample data
    console.log('📊 Проверка данных:');
    const sampleResult = await client.query(`
      SELECT
        stat_date,
        campaign_name,
        total_orders,
        total_revenue,
        money_spent
      FROM ozon_performance_summary
      ORDER BY stat_date DESC
      LIMIT 5
    `);

    if (sampleResult.rows.length > 0) {
      console.log('');
      console.log('   Последние записи:');
      sampleResult.rows.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.stat_date} | ${row.campaign_name || 'N/A'} | Orders: ${row.total_orders} | Revenue: ${row.total_revenue}`);
      });
      console.log('');
      console.log('✅ Данные должны появиться в приложении!');
      console.log('   Обновите страницу (F5) в разделе "Аналитика Продвижений"');
    } else {
      console.log('');
      console.log('⚠️ VIEW создан, но данных нет');
      console.log('   Возможно, нужно запустить синхронизацию OZON');
    }

  } catch (error) {
    console.error('❌ Ошибка при применении миграции:');
    console.error(error.message);
    console.error('');
    console.error('💡 Попробуйте применить миграцию вручную через Supabase SQL Editor:');
    console.error('   https://supabase.com/dashboard/project/your-project-id/sql/new');
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
