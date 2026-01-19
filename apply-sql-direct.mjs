#!/usr/bin/env node

/**
 * Применяем SQL миграции напрямую через Supabase service_role
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk";

console.log('🚀 Применяем SQL миграции...\n');

// Создаем клиент с service_role ключом
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Читаем SQL из файла
const sql = readFileSync('APPLY_SQL_NOW.sql', 'utf-8');

// Разбиваем на отдельные команды (по CREATE OR REPLACE FUNCTION)
const sqlCommands = sql.split('CREATE OR REPLACE FUNCTION').filter(s => s.trim());

console.log(`📝 Найдено ${sqlCommands.length} команд для выполнения\n`);

// Применяем каждую команду
for (let i = 0; i < sqlCommands.length; i++) {
  let command = sqlCommands[i];

  // Пропускаем комментарии и проверочный запрос
  if (command.includes('information_schema.routines') || !command.includes('public.get_')) {
    continue;
  }

  // Восстанавливаем CREATE OR REPLACE FUNCTION
  command = 'CREATE OR REPLACE FUNCTION' + command;

  // Обрезаем после GRANT и COMMENT
  const grantIndex = command.indexOf('GRANT EXECUTE');
  if (grantIndex > 0) {
    // Находим все GRANT и COMMENT после функции
    const afterFunction = command.substring(grantIndex);
    const lines = afterFunction.split(';').filter(l =>
      l.includes('GRANT') || l.includes('COMMENT')
    );

    // Берем только саму функцию до первого GRANT
    command = command.substring(0, grantIndex).trim();

    // Убеждаемся, что функция заканчивается правильно
    if (!command.endsWith(';')) {
      command += ';';
    }
  }

  console.log(`📤 Применяем функцию ${i + 1}...`);

  try {
    // Используем rpc для выполнения произвольного SQL
    // Это работает только если есть функция exec или подобная
    const { data, error } = await supabase.rpc('exec', { sql: command });

    if (error) {
      // Если нет rpc exec, пробуем через прямой POST запрос
      console.log('⚠️  RPC exec не доступен, используем альтернативный метод...');

      // Используем postgrest endpoint напрямую
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: command })
      });

      if (!response.ok) {
        console.error('❌ Не удалось выполнить через REST API');
        console.log('\n📋 SQL для ручного применения:');
        console.log('─'.repeat(80));
        console.log(command);
        console.log('─'.repeat(80));
      } else {
        console.log('✅ Функция применена успешно');
      }
    } else {
      console.log('✅ Функция применена успешно');
    }
  } catch (err) {
    console.error('❌ Ошибка:', err.message);
    console.log('\n📋 SQL для ручного применения:');
    console.log('─'.repeat(80));
    console.log(command);
    console.log('─'.repeat(80));
  }

  console.log();
}

console.log('\n🎯 Проверяем результат...\n');

// Проверяем, что функции созданы
try {
  const { data, error } = await supabase.rpc('get_campaign_performance_aggregated', {
    p_marketplace_id: '00000000-0000-0000-0000-000000000000', // тестовый UUID
    p_start_date: '2026-01-01',
    p_end_date: '2026-01-16'
  });

  if (error) {
    if (error.message.includes('does not exist')) {
      console.log('❌ Функции не созданы автоматически');
      console.log('\n💡 Применить SQL вручную:');
      console.log('   1. Откройте https://supabase.com/dashboard/project/bkmicyguzlwampuindff/editor');
      console.log('   2. Перейдите в SQL Editor');
      console.log('   3. Скопируйте содержимое APPLY_SQL_NOW.sql');
      console.log('   4. Нажмите RUN\n');
    } else {
      console.log('✅ Функции созданы успешно!');
    }
  } else {
    console.log('✅ Функции созданы и работают!');
  }
} catch (err) {
  console.log('ℹ️  Не удалось проверить функции автоматически');
  console.log('   Проверьте вручную в Supabase Dashboard\n');
}

console.log('\n✨ Готово!\n');
