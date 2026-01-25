#!/usr/bin/env node

/**
 * Применение SQL миграций через прямое подключение к PostgreSQL
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
console.log(`${colors.cyan}${colors.bright}║     🚀 ПРИМЕНЕНИЕ SQL МИГРАЦИЙ (ИСПРАВЛЕНИЕ ЛИМИТА 1000)        ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

// Построим connection string для Supabase
const SUPABASE_PROJECT_REF = 'bkmicyguzlwampuindff';
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PASSWORD;

if (!DB_PASSWORD) {
  console.log(`${colors.yellow}⚠️  ВНИМАНИЕ: Не найден пароль БД в переменных окружения${colors.reset}`);
  console.log(`${colors.yellow}   Ожидаемые переменные: SUPABASE_DB_PASSWORD или DB_PASSWORD${colors.reset}\n`);

  console.log(`${colors.cyan}📋 ИНСТРУКЦИЯ ПО ПРИМЕНЕНИЮ МИГРАЦИЙ ВРУЧНУЮ:${colors.reset}`);
  console.log(`${colors.bright}${'─'.repeat(70)}${colors.reset}`);
  console.log(`\n1. Откройте ${colors.green}https://supabase.com/dashboard${colors.reset}`);
  console.log(`2. Выберите проект (${SUPABASE_PROJECT_REF})`);
  console.log(`3. Перейдите в ${colors.bright}SQL Editor${colors.reset} (левое меню)`);
  console.log(`4. Создайте новый query`);
  console.log(`5. Скопируйте содержимое файлов миграций:\n`);

  const migrationFiles = [
    'supabase/migrations/20260116000000_create_campaign_aggregation_function.sql',
    'supabase/migrations/20260116000001_create_product_performance_function.sql'
  ];

  migrationFiles.forEach((file, index) => {
    console.log(`   ${colors.bright}Миграция ${index + 1}:${colors.reset}`);
    console.log(`   ${colors.green}${file}${colors.reset}\n`);
  });

  console.log(`6. Вставьте SQL в редактор и нажмите ${colors.bright}Run${colors.reset} (Ctrl+Enter)`);
  console.log(`7. Дождитесь сообщения: ${colors.green}"Success. No rows returned"${colors.reset}\n`);

  console.log(`${colors.cyan}💡 ИЛИ:${colors.reset} Установите переменную окружения и запустите снова:\n`);
  console.log(`   ${colors.bright}export SUPABASE_DB_PASSWORD="ваш-пароль"${colors.reset}`);
  console.log(`   ${colors.bright}node run-migrations.mjs${colors.reset}\n`);

  // Выводим содержимое миграций для удобства
  console.log(`${colors.cyan}📄 СОДЕРЖИМОЕ МИГРАЦИЙ:${colors.reset}`);
  console.log(`${colors.bright}${'═'.repeat(70)}${colors.reset}\n`);

  migrationFiles.forEach((file, index) => {
    const filePath = join(__dirname, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      console.log(`${colors.blue}${colors.bright}Миграция ${index + 1}: ${file}${colors.reset}`);
      console.log(`${colors.bright}${'─'.repeat(70)}${colors.reset}`);
      console.log(content);
      console.log(`${colors.bright}${'─'.repeat(70)}${colors.reset}\n`);
    } catch (error) {
      console.log(`${colors.red}❌ Не удалось прочитать файл: ${file}${colors.reset}\n`);
    }
  });

  process.exit(0);
}

// Если пароль найден, пытаемся подключиться
const connectionString = `postgresql://postgres:${DB_PASSWORD}@db.${SUPABASE_PROJECT_REF}.supabase.co:5432/postgres`;

console.log(`${colors.blue}🔌 Подключаемся к базе данных...${colors.reset}`);

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log(`${colors.green}✅ Подключение установлено${colors.reset}\n`);

  // Применяем миграции
  const migrationFiles = [
    'supabase/migrations/20260116000000_create_campaign_aggregation_function.sql',
    'supabase/migrations/20260116000001_create_product_performance_function.sql'
  ];

  for (const file of migrationFiles) {
    const filePath = join(__dirname, file);
    console.log(`${colors.blue}📝 Применяем миграцию: ${file}${colors.reset}`);

    try {
      const sql = readFileSync(filePath, 'utf-8');
      await client.query(sql);
      console.log(`${colors.green}✅ Миграция применена успешно${colors.reset}\n`);
    } catch (error) {
      console.error(`${colors.red}❌ Ошибка при применении миграции:${colors.reset}`, error.message);
      console.log(`${colors.yellow}⚠️  Возможно, функция уже существует (это нормально)${colors.reset}\n`);
    }
  }

  // Проверяем, что функции созданы
  console.log(`${colors.blue}🔍 Проверяем созданные функции...${colors.reset}`);

  const checkQuery = `
    SELECT routine_name, routine_type
    FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name IN (
        'get_campaign_performance_aggregated',
        'get_product_performance_by_campaign'
      )
    ORDER BY routine_name;
  `;

  const result = await client.query(checkQuery);

  if (result.rows.length > 0) {
    console.log(`${colors.green}✅ Функции успешно созданы:${colors.reset}`);
    result.rows.forEach(row => {
      console.log(`   - ${colors.bright}${row.routine_name}${colors.reset} (${row.routine_type})`);
    });
  } else {
    console.log(`${colors.red}❌ Функции не найдены в базе данных${colors.reset}`);
  }

  console.log(`\n${colors.green}${colors.bright}✨ ГОТОВО!${colors.reset}`);
  console.log(`\n${colors.cyan}📚 СЛЕДУЮЩИЕ ШАГИ:${colors.reset}`);
  console.log(`   1. Перезагрузите страницу аналитики в приложении`);
  console.log(`   2. Проверьте логи в Chrome DevTools (F12 -> Console)`);
  console.log(`   3. Убедитесь, что загружаются все данные без лимита 1000 записей\n`);

} catch (error) {
  console.error(`${colors.red}❌ Ошибка подключения:${colors.reset}`, error.message);
  console.log(`\n${colors.yellow}💡 СОВЕТ: Проверьте, что пароль БД правильный${colors.reset}`);
  console.log(`${colors.yellow}   Вы можете найти его в Supabase Dashboard -> Settings -> Database${colors.reset}\n`);
  process.exit(1);
} finally {
  await client.end();
}
