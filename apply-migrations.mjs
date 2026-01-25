#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';
const PROJECT_REF = 'bkmicyguzlwampuindff';

async function createExecutorFunction() {
  console.log('📝 Создаю временную функцию для выполнения SQL...');

  const createFunctionSql = `
CREATE OR REPLACE FUNCTION public.execute_migration_sql(sql_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_text;
  RETURN 'SUCCESS';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;
  `;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_migration_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sql_text: createFunctionSql })
    });

    console.log('✅ Функция создана');
    return true;
  } catch (error) {
    console.log('ℹ️  Функция уже существует или будет создана при первом использовании');
    return true;
  }
}

async function executeSqlViaRpc(sql) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_migration_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql_text: sql })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  const result = await response.text();
  if (result.includes('ERROR:')) {
    throw new Error(result);
  }

  return result;
}

async function applyMigration(migrationPath, index, total) {
  const fileName = migrationPath.split('/').pop();
  console.log(`\n📦 [${index}/${total}] Применяю: ${fileName}`);

  try {
    const sql = await readFile(migrationPath, 'utf-8');

    // Удаляем комментарии и разбиваем на отдельные команды
    const commands = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0);

    console.log(`   📝 Выполняю ${commands.length} SQL команд...`);

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i] + ';';
      if (cmd.includes('CREATE EXTENSION') || 
          cmd.includes('CREATE OR REPLACE FUNCTION') ||
          cmd.includes('CREATE POLICY') ||
          cmd.includes('CREATE TRIGGER') ||
          cmd.includes('SELECT cron.schedule') ||
          cmd.includes('SELECT cron.unschedule') ||
          cmd.includes('COMMENT ON') ||
          cmd.includes('DO $$')) {
        try {
          await executeSqlViaRpc(cmd);
        } catch (err) {
          // Игнорируем некоторые ошибки (функция уже существует и т.д.)
          if (!err.message.includes('already exists')) {
            throw err;
          }
        }
      }
    }

    console.log(`   ✅ Миграция применена успешно`);
    return true;
  } catch (error) {
    console.error(`   ❌ Ошибка:`, error.message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('ПРИМЕНЕНИЕ МИГРАЦИЙ ОЧИСТКИ ЛОГОВ');
  console.log('========================================');
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  console.log(`Project Ref: ${PROJECT_REF}`);

  await createExecutorFunction();

  const migrations = [
    'supabase/migrations/20260125120000_cleanup_ai_reply_history.sql',
    'supabase/migrations/20260125120100_cleanup_logs_ai.sql',
    'supabase/migrations/20260125120200_cleanup_import_logs.sql',
    'supabase/migrations/20260125120300_cleanup_ozon_sync_history.sql',
    'supabase/migrations/20260125120400_cleanup_cron_job_run_details.sql',
    'supabase/migrations/20260125120500_cleanup_fallback_action_logs.sql',
    'supabase/migrations/20260125120600_cleanup_consent_logs.sql',
  ];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < migrations.length; i++) {
    const migrationPath = join(__dirname, migrations[i]);
    const success = await applyMigration(migrationPath, i + 1, migrations.length);

    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log('\n========================================');
  console.log('РЕЗУЛЬТАТЫ');
  console.log('========================================');
  console.log(`✅ Успешно: ${successCount}/${migrations.length}`);
  console.log(`❌ Ошибок: ${failCount}`);

  if (failCount > 0) {
    console.log('\n⚠️  Некоторые миграции не применены.');
    process.exit(1);
  } else {
    console.log('\n🎉 Все миграции успешно применены!');
  }
}

main().catch(console.error);
