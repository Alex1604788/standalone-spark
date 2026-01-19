#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('\n🔍 УПРОЩЕННАЯ ДИАГНОСТИКА БАЗЫ ДАННЫХ\n');
console.log('='.repeat(80));

async function runQuery(name, sql) {
  console.log(`\n📊 ${name}`);
  console.log('-'.repeat(80));

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.log(`   ⚠️ Ошибка: ${error.message}`);
      return null;
    }

    if (data && data.length > 0) {
      console.table(data);
      console.log(`   Записей: ${data.length}`);
    } else {
      console.log('   Нет данных');
    }

    return data;
  } catch (err) {
    console.log(`   ⚠️ Ошибка: ${err.message}`);
    return null;
  }
}

async function getTableCounts() {
  console.log('\n📊 КОЛИЧЕСТВО ЗАПИСЕЙ В ТАБЛИЦАХ');
  console.log('-'.repeat(80));

  const tables = [
    'profiles', 'marketplaces', 'products', 'reviews', 'questions',
    'reply_templates', 'replies', 'audit_log', 'logs_ai', 'ai_reply_history',
    'ozon_performance_daily', 'ozon_accruals', 'storage_costs', 'promotion_costs',
    'import_logs', 'chats', 'chat_messages', 'ozon_sync_history',
    'product_business_data', 'product_knowledge', 'suppliers',
    'marketplace_api_credentials', 'consent_logs', 'fallback_action_logs'
  ];

  const counts = [];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (!error.message.includes('does not exist')) {
          counts.push({ table, count: `⚠️ ${error.message}`, order: 0 });
        }
      } else {
        counts.push({ table, count: (count || 0).toLocaleString(), order: count || 0 });
      }
    } catch (err) {
      // Игнорируем ошибки несуществующих таблиц
    }
  }

  // Сортируем по количеству записей
  counts.sort((a, b) => b.order - a.order);

  console.table(counts.map(({ table, count }) => ({ table, count })));
}

async function checkDuplicates() {
  console.log('\n\n📊 ПРОВЕРКА ДУБЛИКАТОВ');
  console.log('-'.repeat(80));

  const duplicates = [];

  // Проверка дубликатов в reviews
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('marketplace_id, review_id');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(r => `${r.marketplace_id}-${r.review_id}`)).size;
      const dups = total - unique;
      duplicates.push({
        table: 'reviews',
        total: total.toLocaleString(),
        unique: unique.toLocaleString(),
        duplicates: dups.toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Проверка дубликатов в products
  try {
    const { data, error } = await supabase
      .from('products')
      .select('marketplace_id, sku');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(p => `${p.marketplace_id}-${p.sku}`)).size;
      const dups = total - unique;
      duplicates.push({
        table: 'products',
        total: total.toLocaleString(),
        unique: unique.toLocaleString(),
        duplicates: dups.toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Проверка дубликатов в ozon_performance_daily
  try {
    const { data, error } = await supabase
      .from('ozon_performance_daily')
      .select('campaign_id, stat_date');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(o => `${o.campaign_id}-${o.stat_date}`)).size;
      const dups = total - unique;
      duplicates.push({
        table: 'ozon_performance_daily',
        total: total.toLocaleString(),
        unique: unique.toLocaleString(),
        duplicates: dups.toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  console.table(duplicates);
}

async function checkOldData() {
  console.log('\n\n📊 СТАРЫЕ ДАННЫЕ (которые можно архивировать)');
  console.log('-'.repeat(80));

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const threeMonthsAgoStr = threeMonthsAgo.toISOString();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const sixMonthsAgoStr = sixMonthsAgo.toISOString();

  const oldData = [];

  // Старые логи AI (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('logs_ai')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', threeMonthsAgoStr);

    if (!error) {
      oldData.push({
        category: 'logs_ai (>90 дней)',
        old_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Старые ai_reply_history (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('ai_reply_history')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', threeMonthsAgoStr);

    if (!error) {
      oldData.push({
        category: 'ai_reply_history (>90 дней)',
        old_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Старые audit_log (>6 месяцев)
  try {
    const { count, error } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .lt('timestamp', sixMonthsAgoStr);

    if (!error) {
      oldData.push({
        category: 'audit_log (>180 дней)',
        old_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Старые import_logs (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('import_logs')
      .select('*', { count: 'exact', head: true })
      .lt('imported_at', threeMonthsAgoStr);

    if (!error) {
      oldData.push({
        category: 'import_logs (>90 дней)',
        old_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Старые ozon_sync_history (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('ozon_sync_history')
      .select('*', { count: 'exact', head: true })
      .lt('started_at', threeMonthsAgoStr);

    if (!error) {
      oldData.push({
        category: 'ozon_sync_history (>90 дней)',
        old_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  console.table(oldData);
}

async function checkRecentData() {
  console.log('\n\n📊 НЕДАВНИЕ ДАННЫЕ (последний месяц)');
  console.log('-'.repeat(80));

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoStr = oneMonthAgo.toISOString();

  const recentData = [];

  // Отзывы за последний месяц
  try {
    const { count, error } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      recentData.push({
        category: 'reviews за последний месяц',
        recent_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Ответы за последний месяц
  try {
    const { count, error } = await supabase
      .from('replies')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      recentData.push({
        category: 'replies за последний месяц',
        recent_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // OZON Performance за последний месяц
  try {
    const { count, error } = await supabase
      .from('ozon_performance_daily')
      .select('*', { count: 'exact', head: true })
      .gte('stat_date', oneMonthAgoStr.split('T')[0]);

    if (!error) {
      recentData.push({
        category: 'ozon_performance_daily за последний месяц',
        recent_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  // Сообщения чата за последний месяц
  try {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      recentData.push({
        category: 'chat_messages за последний месяц',
        recent_records: (count || 0).toLocaleString()
      });
    }
  } catch (err) {
    // Игнорируем
  }

  console.table(recentData);
}

async function main() {
  try {
    await getTableCounts();
    await checkDuplicates();
    await checkOldData();
    await checkRecentData();

    console.log('\n\n' + '='.repeat(80));
    console.log('✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
    console.log('='.repeat(80));

    console.log('\n💡 РЕКОМЕНДАЦИИ:');
    console.log('   1. Проверьте таблицы с наибольшим количеством записей');
    console.log('   2. Удалите дубликаты если они обнаружены');
    console.log('   3. Архивируйте старые логи (>3-6 месяцев)');
    console.log('   4. Для более детальной диагностики запустите SQL файлы в Supabase Dashboard');
    console.log('      https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new\n');

  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

main();
