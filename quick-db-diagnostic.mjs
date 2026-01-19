import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function countTableRecords(tableName) {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true });

    if (error) {
      return { table: tableName, count: 'N/A', error: error.message };
    }
    return { table: tableName, count };
  } catch (err) {
    return { table: tableName, count: 'N/A', error: err.message };
  }
}

async function checkOldRecords(tableName, dateColumn, daysThreshold) {
  try {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - daysThreshold);

    const { count, error } = await supabase
      .from(tableName)
      .select('*', { count: 'exact', head: true })
      .lt(dateColumn, thresholdDate.toISOString());

    if (error) {
      return { table: tableName, oldRecords: 'N/A', threshold: `${daysThreshold} дней`, error: error.message };
    }
    return { table: tableName, oldRecords: count, threshold: `${daysThreshold} дней` };
  } catch (err) {
    return { table: tableName, oldRecords: 'N/A', threshold: `${daysThreshold} дней`, error: err.message };
  }
}

async function runQuickDiagnostic() {
  console.log('='.repeat(80));
  console.log('📊 БЫСТРАЯ ДИАГНОСТИКА БАЗЫ ДАННЫХ SUPABASE');
  console.log('='.repeat(80));
  console.log();

  // List of all tables
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
    'fallback_action_logs',
    'ozon_credentials',
    'marketplace_settings',
    'marketplace_api_credentials',
    'product_volume_standards',
    'product_volume_history',
    'user_roles',
    'user_settings',
    'analytics_metrics',
    'ozon_ui_connections',
    'import_column_mappings'
  ];

  console.log('📈 ШАГ 1: Подсчет записей в каждой таблице');
  console.log('-'.repeat(80));

  const counts = [];
  for (const table of tables) {
    const result = await countTableRecords(table);
    counts.push(result);
    if (result.error) {
      console.log(`   ⚠️  ${table}: Ошибка - ${result.error}`);
    } else {
      console.log(`   ✅ ${table}: ${result.count.toLocaleString()} записей`);
    }
  }

  console.log();
  console.log('📊 Топ 10 самых больших таблиц по количеству записей:');
  console.log('-'.repeat(80));
  const sortedCounts = counts
    .filter(c => typeof c.count === 'number')
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  console.table(sortedCounts);

  console.log();
  console.log('🗑️  ШАГ 2: Проверка старых записей (потенциально для удаления)');
  console.log('-'.repeat(80));

  const oldRecordsChecks = [
    { table: 'logs_ai', dateColumn: 'created_at', days: 90 },
    { table: 'ai_reply_history', dateColumn: 'created_at', days: 90 },
    { table: 'audit_log', dateColumn: 'timestamp', days: 180 },
    { table: 'consent_logs', dateColumn: 'logged_at', days: 180 },
    { table: 'fallback_action_logs', dateColumn: 'logged_at', days: 180 },
    { table: 'import_logs', dateColumn: 'imported_at', days: 90 },
    { table: 'ozon_sync_history', dateColumn: 'synced_at', days: 90 }
  ];

  const oldRecordsResults = [];
  for (const check of oldRecordsChecks) {
    const result = await checkOldRecords(check.table, check.dateColumn, check.days);
    oldRecordsResults.push(result);
    if (result.error) {
      console.log(`   ⚠️  ${check.table}: Ошибка - ${result.error}`);
    } else {
      console.log(`   📅 ${check.table}: ${result.oldRecords.toLocaleString()} старых записей (>${check.days} дней)`);
    }
  }

  console.log();
  console.table(oldRecordsResults);

  console.log();
  console.log('🔍 ШАГ 3: Проверка потенциальных дубликатов');
  console.log('-'.repeat(80));

  // Check for duplicate reviews
  try {
    const { data: reviewDuplicates, error: reviewError } = await supabase
      .rpc('check_review_duplicates', {})
      .catch(err => {
        console.log('   ℹ️  Функция check_review_duplicates не найдена, пропускаем');
        return { data: null, error: null };
      });

    if (reviewError) {
      console.log(`   ℹ️  Не удалось проверить дубликаты отзывов: ${reviewError.message}`);
    } else if (reviewDuplicates) {
      console.log(`   ✅ Дубликаты отзывов проверены`);
    }
  } catch (err) {
    console.log('   ℹ️  Проверка дубликатов отзывов пропущена');
  }

  console.log();
  console.log('📋 ШАГ 4: Анализ данных по месяцам (последние 6 месяцев)');
  console.log('-'.repeat(80));

  // Check reviews by month
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  try {
    const { data: reviewsByMonth, error } = await supabase
      .from('reviews')
      .select('created_at')
      .gte('created_at', sixMonthsAgo.toISOString());

    if (!error && reviewsByMonth) {
      const monthCounts = {};
      reviewsByMonth.forEach(row => {
        const month = new Date(row.created_at).toISOString().substring(0, 7);
        monthCounts[month] = (monthCounts[month] || 0) + 1;
      });

      console.log('   📊 Отзывы по месяцам:');
      Object.entries(monthCounts)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .forEach(([month, count]) => {
          console.log(`      ${month}: ${count.toLocaleString()} записей`);
        });
    }
  } catch (err) {
    console.log('   ⚠️  Не удалось получить данные по месяцам');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('📝 РЕКОМЕНДАЦИИ ПО ОПТИМИЗАЦИИ');
  console.log('='.repeat(80));
  console.log();

  const topTable = sortedCounts[0];
  if (topTable && topTable.count > 10000) {
    console.log(`⚠️  Таблица "${topTable.table}" содержит ${topTable.count.toLocaleString()} записей`);
    console.log('   Рекомендуется проверить необходимость всех данных');
  }

  const totalOldRecords = oldRecordsResults
    .filter(r => typeof r.oldRecords === 'number')
    .reduce((sum, r) => sum + r.oldRecords, 0);

  if (totalOldRecords > 0) {
    console.log();
    console.log(`🗑️  Найдено ${totalOldRecords.toLocaleString()} старых записей в логах`);
    console.log('   Рекомендуется рассмотреть возможность их удаления или архивирования');
  }

  console.log();
  console.log('📌 Для детальной диагностики размера базы данных выполните:');
  console.log('   psql "postgresql://postgres.bkmicyguzlwampuindff@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" -f DATABASE_SIZE_DIAGNOSTIC.sql');
  console.log();
  console.log('='.repeat(80));
  console.log('✅ Быстрая диагностика завершена');
  console.log('='.repeat(80));
}

// Check if service role key is provided
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Ошибка: Не указан SUPABASE_SERVICE_ROLE_KEY');
  console.error('');
  console.error('Установите переменную окружения:');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"');
  console.error('');
  console.error('Ключ можно найти в Supabase Dashboard -> Project Settings -> API');
  process.exit(1);
}

runQuickDiagnostic().catch(console.error);
