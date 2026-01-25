#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    headers: {
      'apikey': SERVICE_ROLE_KEY
    }
  }
});

console.log('🔍 АВТОМАТИЧЕСКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES\n');
console.log('=' .repeat(80) + '\n');

// Запрос 1: Общая статистика
async function query1() {
  console.log('📊 1. ОБЩАЯ СТАТИСТИКА');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .rpc('execute_sql', {
      query: `
        SELECT
          COUNT(*) as total_records,
          MIN(created_at)::date as oldest_record,
          MAX(created_at)::date as newest_record,
          pg_size_pretty(pg_total_relation_size('public.replies')) as total_size
        FROM replies;
      `
    });

  if (error) {
    // Fallback - прямой запрос
    const { count } = await supabase.from('replies').select('*', { count: 'exact', head: true });

    const { data: oldest } = await supabase
      .from('replies')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);

    const { data: newest } = await supabase
      .from('replies')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    console.log(`Всего записей: ${count}`);
    console.log(`Самая старая запись: ${oldest?.[0]?.created_at || 'N/A'}`);
    console.log(`Самая новая запись: ${newest?.[0]?.created_at || 'N/A'}`);
  } else {
    console.table(data);
  }
  console.log('\n');
}

// Запрос 2: Распределение по статусам
async function query2() {
  console.log('📈 2. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .from('replies')
    .select('status');

  if (!error && data) {
    const statusCount = data.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    const total = data.length;

    console.table(
      Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({
          'Статус': status,
          'Количество': count,
          'Процент': ((count / total) * 100).toFixed(2) + '%'
        }))
    );
  } else {
    console.log('❌ Ошибка:', error?.message);
  }
  console.log('\n');
}

// Запрос 3: Старые записи
async function query3() {
  console.log('🗓️  3. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)');
  console.log('-'.repeat(80));

  const date90DaysAgo = new Date();
  date90DaysAgo.setDate(date90DaysAgo.getDate() - 90);

  const { data, error } = await supabase
    .from('replies')
    .select('status, created_at')
    .lt('created_at', date90DaysAgo.toISOString());

  if (!error && data) {
    const statusCount = data.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`Всего старых записей: ${data.length}\n`);
    console.table(
      Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({
          'Статус': status,
          'Количество': count
        }))
    );
  } else {
    console.log('❌ Ошибка:', error?.message);
  }
  console.log('\n');
}

// Запрос 4: Очень старые записи
async function query4() {
  console.log('📅 4. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)');
  console.log('-'.repeat(80));

  const date180DaysAgo = new Date();
  date180DaysAgo.setDate(date180DaysAgo.getDate() - 180);

  const { data, error } = await supabase
    .from('replies')
    .select('status, created_at')
    .lt('created_at', date180DaysAgo.toISOString());

  if (!error && data) {
    const statusCount = data.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`Всего очень старых записей: ${data.length}\n`);
    console.table(
      Object.entries(statusCount)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => ({
          'Статус': status,
          'Количество': count
        }))
    );
  } else {
    console.log('❌ Ошибка:', error?.message);
  }
  console.log('\n');
}

// Запрос 5: Failed по периодам
async function query5() {
  console.log('❌ 5. FAILED ЗАПИСИ ПО ПЕРИОДАМ');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .from('replies')
    .select('created_at')
    .eq('status', 'failed');

  if (!error && data) {
    const now = new Date();
    const periodCounts = {
      '< 7 дней': 0,
      '7-30 дней': 0,
      '30-90 дней': 0,
      '90-180 дней': 0,
      '> 180 дней': 0
    };

    data.forEach(row => {
      const createdAt = new Date(row.created_at);
      const daysAgo = (now - createdAt) / (1000 * 60 * 60 * 24);

      if (daysAgo < 7) periodCounts['< 7 дней']++;
      else if (daysAgo < 30) periodCounts['7-30 дней']++;
      else if (daysAgo < 90) periodCounts['30-90 дней']++;
      else if (daysAgo < 180) periodCounts['90-180 дней']++;
      else periodCounts['> 180 дней']++;
    });

    console.log(`Всего failed записей: ${data.length}\n`);
    console.table(
      Object.entries(periodCounts)
        .filter(([_, count]) => count > 0)
        .map(([period, count]) => ({
          'Период': period,
          'Количество': count
        }))
    );
  } else {
    console.log('❌ Ошибка:', error?.message);
  }
  console.log('\n');
}

// Запрос 6: ПОТЕНЦИАЛ ОЧИСТКИ
async function query6() {
  console.log('🧹 6. ПОТЕНЦИАЛ ОЧИСТКИ');
  console.log('-'.repeat(80));

  const now = new Date();
  const date30 = new Date(); date30.setDate(date30.getDate() - 30);
  const date90 = new Date(); date90.setDate(date90.getDate() - 90);
  const date180 = new Date(); date180.setDate(date180.getDate() - 180);

  // Failed > 30 дней
  const { count: failed30 } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .lt('created_at', date30.toISOString());

  // Drafted > 90 дней
  const { count: drafted90 } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'drafted')
    .lt('created_at', date90.toISOString());

  // Published > 180 дней
  const { count: published180 } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .lt('published_at', date180.toISOString());

  console.table([
    {
      'Тип очистки': 'Failed > 30 дней',
      'Записей': failed30 || 0,
      'Приоритет': 'ВЫСОКИЙ'
    },
    {
      'Тип очистки': 'Drafted > 90 дней',
      'Записей': drafted90 || 0,
      'Приоритет': 'СРЕДНИЙ'
    },
    {
      'Тип очистки': 'Published > 180 дней',
      'Записей': published180 || 0,
      'Приоритет': 'НИЗКИЙ'
    }
  ]);
  console.log('\n');
}

// ИТОГОВЫЕ РЕКОМЕНДАЦИИ
function printRecommendations(stats) {
  console.log('💡 ИТОГОВЫЕ РЕКОМЕНДАЦИИ');
  console.log('='.repeat(80));
  console.log(`
✅ ДЕЙСТВИЯ ДЛЯ ОПТИМИЗАЦИИ:

1️⃣  УДАЛИТЬ failed записи старше 30 дней (высокий приоритет)
2️⃣  УДАЛИТЬ drafted записи старше 90 дней (средний приоритет)
3️⃣  АРХИВИРОВАТЬ published старше 180 дней (низкий приоритет)
4️⃣  Выполнить VACUUM FULL после очистки
5️⃣  Настроить автоматическую очистку через CRON

🎯 СЛЕДУЮЩИЙ ШАГ: Скажи "ДА" и я создам скрипты для очистки!
  `);
}

// Запуск всех запросов
async function runAnalysis() {
  try {
    await query1();
    await query2();
    await query3();
    await query4();
    await query5();
    await query6();
    printRecommendations();

    console.log('✅ Анализ завершен!\n');
  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
  }
}

runAnalysis();
