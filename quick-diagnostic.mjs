#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

console.log('\n🔍 БЫСТРАЯ ДИАГНОСТИКА БАЗЫ ДАННЫХ\n');
console.log('='.repeat(80));

async function runQuery(name, sql) {
  console.log(`\n📊 ${name}`);
  console.log('-'.repeat(80));

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql_query: sql })
    });

    if (!response.ok) {
      // Если exec_sql не работает, пробуем через прямой SQL endpoint
      const directResponse = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: sql })
      });

      if (!directResponse.ok) {
        console.log('   ⚠️ Не удалось выполнить через API');
        return null;
      }
      const result = await directResponse.json();
      return result;
    }

    const result = await response.json();
    return result;
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
    'consent_logs', 'fallback_action_logs'
  ];

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.log(`   ${table}: ⚠️ ${error.message}`);
      } else {
        console.log(`   ${table}: ${count?.toLocaleString() || 0} записей`);
      }
    } catch (err) {
      console.log(`   ${table}: ⚠️ Ошибка`);
    }
  }
}

async function checkDuplicates() {
  console.log('\n\n📊 ПРОВЕРКА ДУБЛИКАТОВ');
  console.log('-'.repeat(80));

  // Проверка дубликатов в reviews
  try {
    const { data, error } = await supabase
      .from('reviews')
      .select('marketplace_id, review_id');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(r => `${r.marketplace_id}-${r.review_id}`)).size;
      const duplicates = total - unique;
      console.log(`   reviews: ${total.toLocaleString()} всего, ${unique.toLocaleString()} уникальных, ${duplicates} дубликатов`);
    }
  } catch (err) {
    console.log('   reviews: ⚠️ Не удалось проверить');
  }

  // Проверка дубликатов в products
  try {
    const { data, error } = await supabase
      .from('products')
      .select('marketplace_id, sku');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(p => `${p.marketplace_id}-${p.sku}`)).size;
      const duplicates = total - unique;
      console.log(`   products: ${total.toLocaleString()} всего, ${unique.toLocaleString()} уникальных, ${duplicates} дубликатов`);
    }
  } catch (err) {
    console.log('   products: ⚠️ Не удалось проверить');
  }

  // Проверка дубликатов в ozon_performance_daily
  try {
    const { data, error } = await supabase
      .from('ozon_performance_daily')
      .select('campaign_id, stat_date');

    if (!error && data) {
      const total = data.length;
      const unique = new Set(data.map(o => `${o.campaign_id}-${o.stat_date}`)).size;
      const duplicates = total - unique;
      console.log(`   ozon_performance_daily: ${total.toLocaleString()} всего, ${unique.toLocaleString()} уникальных, ${duplicates} дубликатов`);
    }
  } catch (err) {
    console.log('   ozon_performance_daily: ⚠️ Не удалось проверить');
  }
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

  // Старые логи AI (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('logs_ai')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', threeMonthsAgoStr);

    if (!error) {
      console.log(`   logs_ai старше 3 месяцев: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   logs_ai: ⚠️ Не удалось проверить');
  }

  // Старые ai_reply_history (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('ai_reply_history')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', threeMonthsAgoStr);

    if (!error) {
      console.log(`   ai_reply_history старше 3 месяцев: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   ai_reply_history: ⚠️ Не удалось проверить');
  }

  // Старые audit_log (>6 месяцев)
  try {
    const { count, error } = await supabase
      .from('audit_log')
      .select('*', { count: 'exact', head: true })
      .lt('timestamp', sixMonthsAgoStr);

    if (!error) {
      console.log(`   audit_log старше 6 месяцев: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   audit_log: ⚠️ Не удалось проверить');
  }

  // Старые import_logs (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('import_logs')
      .select('*', { count: 'exact', head: true })
      .lt('imported_at', threeMonthsAgoStr);

    if (!error) {
      console.log(`   import_logs старше 3 месяцев: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   import_logs: ⚠️ Не удалось проверить');
  }

  // Старые ozon_sync_history (>3 месяцев)
  try {
    const { count, error } = await supabase
      .from('ozon_sync_history')
      .select('*', { count: 'exact', head: true })
      .lt('synced_at', threeMonthsAgoStr);

    if (!error) {
      console.log(`   ozon_sync_history старше 3 месяцев: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   ozon_sync_history: ⚠️ Не удалось проверить');
  }
}

async function checkRecentData() {
  console.log('\n\n📊 НЕДАВНИЕ ДАННЫЕ (последний месяц)');
  console.log('-'.repeat(80));

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoStr = oneMonthAgo.toISOString();

  // Отзывы за последний месяц
  try {
    const { count, error } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      console.log(`   reviews за последний месяц: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   reviews: ⚠️ Не удалось проверить');
  }

  // Ответы за последний месяц
  try {
    const { count, error } = await supabase
      .from('replies')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      console.log(`   replies за последний месяц: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   replies: ⚠️ Не удалось проверить');
  }

  // OZON Performance за последний месяц
  try {
    const { count, error } = await supabase
      .from('ozon_performance_daily')
      .select('*', { count: 'exact', head: true })
      .gte('stat_date', oneMonthAgoStr.split('T')[0]);

    if (!error) {
      console.log(`   ozon_performance_daily за последний месяц: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   ozon_performance_daily: ⚠️ Не удалось проверить');
  }

  // Сообщения чата за последний месяц
  try {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneMonthAgoStr);

    if (!error) {
      console.log(`   chat_messages за последний месяц: ${count?.toLocaleString() || 0} записей`);
    }
  } catch (err) {
    console.log('   chat_messages: ⚠️ Не удалось проверить');
  }
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
    console.log('   4. Для полной диагностики выполните DATABASE_SIZE_DIAGNOSTIC.sql в Supabase Dashboard');
    console.log('      https://supabase.com/dashboard/project/bkmicyguzlwampuindff/sql/new\n');

  } catch (err) {
    console.error('❌ Ошибка:', err.message);
  }
}

main();
