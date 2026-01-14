#!/usr/bin/env node
/**
 * Скрипт для применения миграции VIEW ozon_performance_summary
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Загружаем переменные окружения
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Ошибка: Не найдены SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в .env.local');
  process.exit(1);
}

// Читаем SQL файл
const sqlFilePath = path.join(__dirname, 'supabase/migrations/20260112000000_create_ozon_performance_summary_view.sql');
const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

console.log('📋 Читаем SQL миграцию...');
console.log(`📁 Файл: ${sqlFilePath}`);
console.log(`📊 Размер: ${sqlContent.length} байт`);

// Парсим URL
const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);

// Подготавливаем тело запроса
const postData = JSON.stringify({
  sql: sqlContent
});

// Настройки запроса
const options = {
  hostname: url.hostname,
  port: 443,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Prefer': 'return=minimal'
  }
};

console.log('\n🚀 Применяем миграцию через Supabase API...');

const req = https.request(options, (res) => {
  let responseBody = '';

  res.on('data', (chunk) => {
    responseBody += chunk;
  });

  res.on('end', () => {
    console.log(`\n📡 Статус ответа: ${res.statusCode}`);

    if (res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 204) {
      console.log('✅ Миграция успешно применена!');
      console.log('\n📊 VIEW ozon_performance_summary создан');
      console.log('🎯 Теперь можно использовать VIEW в запросах');
    } else if (res.statusCode === 404) {
      console.log('⚠️  Функция exec_sql не найдена, пробуем альтернативный метод...');
      applyViaDirect();
    } else {
      console.log('❌ Ошибка при применении миграции');
      if (responseBody) {
        console.log('Ответ:', responseBody);
      }
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Ошибка при выполнении запроса:', error.message);
  console.log('\n💡 Попробуйте применить SQL вручную через Supabase Dashboard:');
  console.log(`   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql`);
  process.exit(1);
});

req.write(postData);
req.end();

// Альтернативный метод - прямое выполнение через SQL Editor
function applyViaDirect() {
  console.log('\n💡 Применение через прямой SQL запрос...');

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Разбиваем SQL на отдельные команды
  const commands = sqlContent
    .split(';')
    .map(cmd => cmd.trim())
    .filter(cmd => cmd && !cmd.startsWith('--'));

  console.log(`📝 Всего команд: ${commands.length}`);

  // Выполняем команды последовательно
  (async () => {
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd) {
        console.log(`\n[${i + 1}/${commands.length}] Выполняем команду...`);
        try {
          const { data, error } = await supabase.rpc('exec', { sql: cmd + ';' });
          if (error) {
            console.error('❌ Ошибка:', error.message);
          } else {
            console.log('✅ Успешно');
          }
        } catch (err) {
          console.error('❌ Ошибка:', err.message);
        }
      }
    }
    console.log('\n✅ Миграция завершена!');
  })();
}
