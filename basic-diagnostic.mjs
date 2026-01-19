import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function countTableRecords(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      return { table: tableName, count: 'Нет доступа', status: 'restricted' };
    }
    return { table: tableName, count, status: 'ok' };
  } catch (err) {
    return { table: tableName, count: 'Ошибка', status: 'error', error: err.message };
  }
}

async function runBasicDiagnostic() {
  console.log('='.repeat(80));
  console.log('📊 БАЗОВАЯ ДИАГНОСТИКА БАЗЫ ДАННЫХ SUPABASE');
  console.log('   (Используется anon key - может быть ограниченный доступ)');
  console.log('='.repeat(80));
  console.log();

  // List of main tables
  const tables = [
    'profiles',
    'marketplaces',
    'products',
    'reviews',
    'questions',
    'reply_templates',
    'replies',
    'audit_log',
    'logs_ai',
    'ai_reply_history',
    'ozon_performance_daily',
    'ozon_accruals',
    'storage_costs',
    'promotion_costs',
    'import_logs',
    'chats',
    'chat_messages',
    'ozon_sync_history',
    'product_business_data',
    'product_knowledge',
    'suppliers',
    'consent_logs',
    'fallback_action_logs'
  ];

  console.log('📈 Подсчет записей в таблицах...');
  console.log('-'.repeat(80));

  const counts = [];
  for (const table of tables) {
    const result = await countTableRecords(table);
    counts.push(result);

    if (result.status === 'ok') {
      const countStr = result.count.toLocaleString().padStart(15);
      console.log(`   ${countStr} - ${table}`);
    } else if (result.status === 'restricted') {
      console.log(`          Нет доступа - ${table}`);
    } else {
      console.log(`             Ошибка - ${table}`);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log();
  console.log('📊 СТАТИСТИКА:');
  console.log('-'.repeat(80));

  const successfulCounts = counts.filter(c => c.status === 'ok' && typeof c.count === 'number');
  const totalRecords = successfulCounts.reduce((sum, c) => sum + c.count, 0);
  const restrictedTables = counts.filter(c => c.status === 'restricted').length;

  console.log(`   Всего таблиц проверено: ${tables.length}`);
  console.log(`   Таблиц с доступом: ${successfulCounts.length}`);
  console.log(`   Таблиц без доступа: ${restrictedTables}`);
  console.log(`   Всего записей (в доступных таблицах): ${totalRecords.toLocaleString()}`);

  console.log();
  console.log('📊 ТОП 10 САМЫХ БОЛЬШИХ ТАБЛИЦ:');
  console.log('-'.repeat(80));

  const topTables = successfulCounts
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  topTables.forEach((t, i) => {
    const position = `${i + 1}.`.padStart(4);
    const count = t.count.toLocaleString().padStart(15);
    console.log(`   ${position} ${count} - ${t.table}`);
  });

  // Estimate approximate size
  console.log();
  console.log('📏 ПРИБЛИЗИТЕЛЬНАЯ ОЦЕНКА РАЗМЕРА:');
  console.log('-'.repeat(80));
  console.log('   (Предположение: ~1KB на запись в среднем)');

  const estimatedSizeMB = (totalRecords * 1024) / (1024 * 1024);
  const estimatedSizeGB = estimatedSizeMB / 1024;

  console.log(`   Приблизительный размер данных: ${estimatedSizeMB.toFixed(2)} MB (${estimatedSizeGB.toFixed(2)} GB)`);
  console.log('   + индексы, TOAST данные, и системные таблицы');

  // Check for large tables that might need cleanup
  console.log();
  console.log('⚠️  ПОТЕНЦИАЛЬНЫЕ ПРОБЛЕМЫ:');
  console.log('-'.repeat(80));

  let hasIssues = false;

  topTables.forEach(t => {
    if (t.count > 50000) {
      console.log(`   ⚠️  ${t.table}: ${t.count.toLocaleString()} записей - возможно, требуется очистка`);
      hasIssues = true;
    }
  });

  // Check log tables
  const logTables = successfulCounts.filter(t =>
    t.table.includes('log') || t.table.includes('history') || t.table.includes('audit')
  );

  if (logTables.length > 0) {
    console.log();
    console.log('   📋 Таблицы логов (рекомендуется периодическая очистка):');
    logTables.forEach(t => {
      console.log(`      - ${t.table}: ${t.count.toLocaleString()} записей`);
    });
  }

  if (!hasIssues && logTables.length === 0) {
    console.log('   ✅ Явных проблем не обнаружено');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('📝 РЕКОМЕНДАЦИИ:');
  console.log('='.repeat(80));
  console.log();
  console.log('1. Для ПОЛНОЙ диагностики запустите SIMPLE_SIZE_CHECK.sql в Supabase SQL Editor:');
  console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new');
  console.log();
  console.log('2. Это покажет РЕАЛЬНЫЙ размер таблиц, индексов и TOAST данных');
  console.log();
  console.log('3. Возможные причины занятости 6GB:');
  console.log('   - Большое количество отзывов/сообщений с длинными текстами');
  console.log('   - Накопившиеся логи (logs_ai, audit_log, ozon_sync_history)');
  console.log('   - Индексы занимают значительное место');
  console.log('   - TOAST данные (большие текстовые поля)');
  console.log('   - Dead tuples (нужен VACUUM)');
  console.log();
  console.log('4. Для детальной диагностики запустите DATABASE_SIZE_DIAGNOSTIC.sql');
  console.log('   через psql или Supabase SQL Editor');
  console.log();
  console.log('='.repeat(80));
  console.log('✅ Базовая диагностика завершена');
  console.log('='.repeat(80));
}

runBasicDiagnostic().catch(console.error);
