#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import pg from 'pg';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

// Database connection string (service_role может подключаться через connection pooler)
const DB_URL = 'postgresql://postgres.bkmicyguzlwampuindff:SparkOzonIntegration2025!@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

console.log('\n🔍 ЗАПУСК ДИАГНОСТИКИ БАЗЫ ДАННЫХ\n');
console.log('='.repeat(80));

async function runDiagnostic() {
  // Читаем SQL файл
  console.log('\n1️⃣ Чтение SQL файла...');
  const sql = readFileSync('./DATABASE_SIZE_DIAGNOSTIC.sql', 'utf8');
  console.log('✅ SQL файл прочитан');

  // Разбиваем на отдельные запросы по ";"
  const queries = sql
    .split(';')
    .map(q => q.trim())
    .filter(q => q && !q.startsWith('--') && q.toUpperCase().includes('SELECT'));

  console.log(`\n2️⃣ Найдено ${queries.length} запросов для выполнения\n`);

  // Подключаемся через pg
  console.log('3️⃣ Подключение к базе данных...');
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Подключение установлено\n');

    console.log('='.repeat(80));
    console.log('РЕЗУЛЬТАТЫ ДИАГНОСТИКИ');
    console.log('='.repeat(80));

    // Выполняем каждый запрос
    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];

      // Определяем название запроса из комментариев или из первых слов
      let queryName = `Запрос ${i + 1}`;

      // Ищем комментарий перед запросом в исходном SQL
      const queryIndex = sql.indexOf(query);
      if (queryIndex > 0) {
        const before = sql.substring(Math.max(0, queryIndex - 200), queryIndex);
        const commentMatch = before.match(/-- (ШАГ \d+:[^-]+)/);
        if (commentMatch) {
          queryName = commentMatch[1].trim();
        }
      }

      console.log(`\n📊 ${queryName}`);
      console.log('-'.repeat(80));

      try {
        const result = await client.query(query);

        if (result.rows && result.rows.length > 0) {
          console.table(result.rows);
          console.log(`   Записей: ${result.rows.length}`);
        } else {
          console.log('   Нет данных');
        }
      } catch (err) {
        console.log(`   ⚠️ Ошибка: ${err.message}`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
    console.log('='.repeat(80));

  } catch (err) {
    console.error('❌ Ошибка подключения:', err.message);
    console.log('\nПопробуйте выполнить SQL вручную в Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
  } finally {
    await client.end();
  }
}

runDiagnostic().catch(console.error);
