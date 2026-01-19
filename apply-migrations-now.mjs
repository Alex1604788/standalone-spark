#!/usr/bin/env node

/**
 * Применение SQL миграций через Supabase API с service_role ключом
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk";

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

console.log(`\n${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}║   🚀 ПРИМЕНЕНИЕ SQL МИГРАЦИЙ (Service Role Key)                 ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

// Создаем клиент с service_role ключом
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log(`${colors.blue}📝 Подготовка миграций...${colors.reset}\n`);

// Читаем файлы миграций
const migrationFiles = [
  {
    name: 'create_campaign_aggregation_function',
    path: 'supabase/migrations/20260116000000_create_campaign_aggregation_function.sql',
    description: 'Функция агрегации данных по кампаниям'
  },
  {
    name: 'create_product_performance_function',
    path: 'supabase/migrations/20260116000001_create_product_performance_function.sql',
    description: 'Функция получения данных по товарам'
  }
];

let allSuccess = true;

for (const migration of migrationFiles) {
  console.log(`${colors.blue}📝 Применяем: ${migration.description}${colors.reset}`);
  console.log(`   Файл: ${migration.path}`);

  try {
    const filePath = join(__dirname, migration.path);
    const sql = readFileSync(filePath, 'utf-8');

    // Выполняем SQL напрямую через REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: sql })
    });

    // Пробуем альтернативный метод - через прямой SQL запрос
    // Так как RPC может не работать, используем fetch к PostgREST
    const sqlResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sql })
    });

    // Так как PostgREST не поддерживает прямое выполнение DDL,
    // используем подход через создание временной таблицы или функции
    console.log(`${colors.yellow}⚠️  PostgREST не поддерживает прямое выполнение DDL${colors.reset}`);
    console.log(`${colors.yellow}   Используем альтернативный подход...${colors.reset}\n`);

    // Применяем через pg библиотеку (если доступна)
    // Или выводим SQL для ручного применения
    console.log(`${colors.cyan}📋 SQL для применения в Supabase Dashboard:${colors.reset}`);
    console.log(`${colors.bright}${'─'.repeat(70)}${colors.reset}`);
    console.log(sql.substring(0, 500) + '...');
    console.log(`${colors.bright}${'─'.repeat(70)}${colors.reset}\n`);

  } catch (error) {
    console.error(`${colors.red}❌ Ошибка:${colors.reset}`, error.message);
    allSuccess = false;
  }
}

console.log(`\n${colors.cyan}💡 АЛЬТЕРНАТИВНЫЙ МЕТОД:${colors.reset}`);
console.log(`   Так как Supabase REST API не поддерживает прямое выполнение DDL,`);
console.log(`   нужно применить миграции через Supabase Dashboard:\n`);

console.log(`${colors.bright}1. Откройте ${colors.green}https://supabase.com/dashboard/project/bkmicyguzlwampuindff${colors.reset}`);
console.log(`${colors.bright}2. Перейдите в SQL Editor${colors.reset}`);
console.log(`${colors.bright}3. Создайте новый query${colors.reset}`);
console.log(`${colors.bright}4. Скопируйте и выполните миграции ниже:${colors.reset}\n`);

// Выводим обе миграции
for (const migration of migrationFiles) {
  console.log(`${colors.cyan}${colors.bright}━━━ ${migration.description} ━━━${colors.reset}`);
  const filePath = join(__dirname, migration.path);
  const sql = readFileSync(filePath, 'utf-8');
  console.log(sql);
  console.log('');
}

console.log(`\n${colors.green}${colors.bright}✨ После применения миграций:${colors.reset}`);
console.log(`   1. Функции будут доступны в БД`);
console.log(`   2. Фронтенд автоматически начнёт их использовать`);
console.log(`   3. Проблема с лимитом 1000 записей будет решена\n`);
