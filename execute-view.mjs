#!/usr/bin/env node
import https from 'https';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

console.log('🚀 Применяем VIEW через Supabase...\n');

// Читаем SQL файл
const sqlContent = readFileSync('VIEW_TO_APPLY.sql', 'utf8');

// Разбиваем на команды
const commands = sqlContent
  .split(';')
  .map(cmd => cmd.trim())
  .filter(cmd => cmd && !cmd.startsWith('--') && cmd.length > 5);

console.log(`📝 Команд к выполнению: ${commands.length}\n`);

// Функция для выполнения SQL через PostgREST
async function executeSQL(sql, index) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec`);

    const postData = JSON.stringify({ query: sql });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      }
    };

    console.log(`[${index}] Выполняем: ${sql.substring(0, 60)}...`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`  ✅ Успешно (${res.statusCode})`);
          resolve({ success: true, status: res.statusCode });
        } else {
          console.log(`  ⚠️  Статус: ${res.statusCode}, Ответ: ${data.substring(0, 100)}`);
          resolve({ success: false, status: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`  ❌ Ошибка: ${error.message}`);
      resolve({ success: false, error: error.message });
    });

    req.write(postData);
    req.end();
  });
}

// Выполняем команды последовательно
(async () => {
  let successCount = 0;

  for (let i = 0; i < commands.length; i++) {
    const result = await executeSQL(commands[i] + ';', i + 1);
    if (result.success) successCount++;
    await new Promise(resolve => setTimeout(resolve, 500)); // Пауза между запросами
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Результат: ${successCount}/${commands.length} команд выполнено успешно\n`);

  // Проверяем создание VIEW
  console.log('🔍 Проверяем что VIEW создался...\n');

  const checkOptions = {
    hostname: 'bkmicyguzlwampuindff.supabase.co',
    port: 443,
    path: '/rest/v1/ozon_performance_summary?select=id&limit=1',
    method: 'GET',
    headers: {
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
    }
  };

  const checkReq = https.request(checkOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('✅ VIEW успешно создан и работает!');
        console.log('📊 Пример данных:', data.substring(0, 200));
      } else {
        console.log('❌ VIEW не найден или не работает');
        console.log('   Статус:', res.statusCode);
        console.log('   Ответ:', data.substring(0, 200));
      }
    });
  });

  checkReq.on('error', (error) => {
    console.log('❌ Ошибка проверки:', error.message);
  });

  checkReq.end();
})();
