#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('🔍 АНАЛИЗ ТАБЛИЦЫ REPLIES\n');
console.log('=' .repeat(80) + '\n');

// Запрос 1: Общая статистика
async function getGeneralStats() {
  console.log('📊 1. ОБЩАЯ СТАТИСТИКА');
  console.log('-'.repeat(80));

  const { data, error } = await supabase.rpc('get_replies_stats');

  if (error) {
    // Если RPC не работает, делаем прямой запрос
    const { count } = await supabase.from('replies').select('*', { count: 'exact', head: true });

    const { data: minMax } = await supabase
      .from('replies')
      .select('created_at')
      .order('created_at', { ascending: true })
      .limit(1);

    const { data: maxDate } = await supabase
      .from('replies')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1);

    console.log(`Всего записей: ${count}`);
    console.log(`Самая старая запись: ${minMax?.[0]?.created_at || 'N/A'}`);
    console.log(`Самая новая запись: ${maxDate?.[0]?.created_at || 'N/A'}`);
  } else {
    console.log(data);
  }
  console.log('\n');
}

// Запрос 2: Распределение по статусам
async function getStatusDistribution() {
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

    Object.entries(statusCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const percent = ((count / total) * 100).toFixed(2);
        console.log(`${status.padEnd(15)} : ${count.toString().padStart(8)} записей (${percent}%)`);
      });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 3: Распределение по режимам
async function getModeDistribution() {
  console.log('🤖 3. РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .from('replies')
    .select('mode');

  if (!error && data) {
    const modeCount = data.reduce((acc, row) => {
      acc[row.mode] = (acc[row.mode] || 0) + 1;
      return acc;
    }, {});

    const total = data.length;

    Object.entries(modeCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([mode, count]) => {
        const percent = ((count / total) * 100).toFixed(2);
        console.log(`${mode.padEnd(15)} : ${count.toString().padStart(8)} записей (${percent}%)`);
      });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 4: Старые записи по статусам
async function getOldRecords() {
  console.log('🗓️  4. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)');
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

    console.log(`Всего старых записей: ${data.length}`);
    console.log('\nПо статусам:');
    Object.entries(statusCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`  ${status.padEnd(15)} : ${count.toString().padStart(8)} записей`);
      });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 5: Очень старые записи (> 180 дней)
async function getVeryOldRecords() {
  console.log('📅 5. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)');
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

    console.log(`Всего очень старых записей: ${data.length}`);
    console.log('\nПо статусам:');
    Object.entries(statusCount)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        console.log(`  ${status.padEnd(15)} : ${count.toString().padStart(8)} записей`);
      });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 6: Failed записи по периодам
async function getFailedByPeriod() {
  console.log('❌ 6. FAILED ЗАПИСИ ПО ПЕРИОДАМ');
  console.log('-'.repeat(80));

  const now = new Date();
  const periods = [
    { name: '< 7 дней', days: 7 },
    { name: '7-30 дней', days: 30 },
    { name: '30-90 дней', days: 90 },
    { name: '90-180 дней', days: 180 },
    { name: '> 180 дней', days: 365 * 10 }
  ];

  const { data, error } = await supabase
    .from('replies')
    .select('created_at')
    .eq('status', 'failed');

  if (!error && data) {
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
    Object.entries(periodCounts).forEach(([period, count]) => {
      if (count > 0) {
        console.log(`${period.padEnd(15)} : ${count.toString().padStart(8)} записей`);
      }
    });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 7: Проверка дубликатов
async function checkDuplicates() {
  console.log('🔍 7. ПРОВЕРКА ДУБЛИКАТОВ');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .from('replies')
    .select('review_id, question_id, status');

  if (!error && data) {
    // Проверка дубликатов по review_id
    const reviewIds = {};
    const questionIds = {};

    data.forEach(row => {
      if (row.review_id) {
        if (!reviewIds[row.review_id]) reviewIds[row.review_id] = [];
        reviewIds[row.review_id].push(row.status);
      }
      if (row.question_id) {
        if (!questionIds[row.question_id]) questionIds[row.question_id] = [];
        questionIds[row.question_id].push(row.status);
      }
    });

    const reviewDuplicates = Object.entries(reviewIds).filter(([_, statuses]) => statuses.length > 1);
    const questionDuplicates = Object.entries(questionIds).filter(([_, statuses]) => statuses.length > 1);

    console.log(`Дубликаты по review_id: ${reviewDuplicates.length}`);
    console.log(`Дубликаты по question_id: ${questionDuplicates.length}`);

    if (reviewDuplicates.length > 0) {
      console.log('\nПримеры дубликатов review_id:');
      reviewDuplicates.slice(0, 5).forEach(([id, statuses]) => {
        console.log(`  ${id}: ${statuses.join(', ')}`);
      });
    }
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Запрос 8: Анализ длины текстов
async function analyzeTextLength() {
  console.log('📝 8. АНАЛИЗ ДЛИНЫ ТЕКСТОВ');
  console.log('-'.repeat(80));

  const { data, error } = await supabase
    .from('replies')
    .select('content');

  if (!error && data) {
    const lengthGroups = {
      '< 100': 0,
      '100-500': 0,
      '500-1000': 0,
      '1000-2000': 0,
      '> 2000': 0
    };

    let totalLength = 0;
    let maxLength = 0;

    data.forEach(row => {
      const len = row.content?.length || 0;
      totalLength += len;
      if (len > maxLength) maxLength = len;

      if (len < 100) lengthGroups['< 100']++;
      else if (len < 500) lengthGroups['100-500']++;
      else if (len < 1000) lengthGroups['500-1000']++;
      else if (len < 2000) lengthGroups['1000-2000']++;
      else lengthGroups['> 2000']++;
    });

    const avgLength = Math.round(totalLength / data.length);

    console.log(`Средняя длина текста: ${avgLength} символов`);
    console.log(`Максимальная длина: ${maxLength} символов`);
    console.log(`Общий размер текстов: ${(totalLength / 1024 / 1024).toFixed(2)} MB\n`);

    console.log('Распределение по длине:');
    Object.entries(lengthGroups).forEach(([group, count]) => {
      const percent = ((count / data.length) * 100).toFixed(2);
      console.log(`  ${group.padEnd(15)} : ${count.toString().padStart(8)} записей (${percent}%)`);
    });
  } else {
    console.log('Ошибка:', error);
  }
  console.log('\n');
}

// Итоговые рекомендации
function printRecommendations(stats) {
  console.log('💡 РЕКОМЕНДАЦИИ ПО ОПТИМИЗАЦИИ');
  console.log('='.repeat(80));
  console.log('\nНа основе анализа данных:\n');

  console.log('1. УДАЛЕНИЕ FAILED ЗАПИСЕЙ');
  console.log('   Рекомендуется удалять failed записи старше 30 дней');
  console.log('   Они занимают место и уже не актуальны\n');

  console.log('2. ОЧИСТКА СТАРЫХ DRAFTED');
  console.log('   Черновики старше 90 дней можно безопасно удалить');
  console.log('   Они скорее всего устарели\n');

  console.log('3. АРХИВАЦИЯ PUBLISHED');
  console.log('   Опубликованные ответы старше 180-365 дней');
  console.log('   Можно архивировать или удалить\n');

  console.log('4. VACUUM ПОСЛЕ ОЧИСТКИ');
  console.log('   После удаления записей обязательно выполнить VACUUM\n');

  console.log('5. НАСТРОИТЬ АВТООЧИСТКУ');
  console.log('   Создать CRON задачу для регулярной очистки старых записей\n');
}

// Запуск всех проверок
async function runAnalysis() {
  try {
    await getGeneralStats();
    await getStatusDistribution();
    await getModeDistribution();
    await getOldRecords();
    await getVeryOldRecords();
    await getFailedByPeriod();
    await checkDuplicates();
    await analyzeTextLength();
    printRecommendations();

    console.log('✅ Анализ завершен!');
  } catch (error) {
    console.error('❌ Ошибка при анализе:', error);
  }
}

runAnalysis();
