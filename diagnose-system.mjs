#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://bkmicyguzlwampuindff.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDY5NTAyMywiZXhwIjoyMDgwMjcxMDIzfQ.F6BnFa-RMYI__r-6bhaLzgZ-7_U-mwvgW_-8fgen0Dk';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

console.log('🔍 ПОЛНАЯ ДИАГНОСТИКА СИСТЕМЫ');
console.log('=' .repeat(80));
console.log('');

// 1. Проверка CRON JOBS
console.log('1️⃣  ПРОВЕРКА CRON JOBS');
console.log('-'.repeat(80));

try {
  const { data: cronJobs, error: cronError } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        jobname,
        schedule,
        active,
        command
      FROM cron.job
      WHERE jobname LIKE '%ozon%'
      ORDER BY jobname;
    `
  });

  if (cronError) {
    console.log('⚠️  Не удалось получить cron jobs (нужна функция exec_sql)');
    console.log('Используем альтернативный метод...\n');
  } else {
    console.table(cronJobs);
  }
} catch (error) {
  console.log('⚠️  Ошибка при проверке cron jobs:', error.message);
}

// 2. Проверка последней синхронизации
console.log('\n2️⃣  ПРОВЕРКА ПОСЛЕДНЕЙ СИНХРОНИЗАЦИИ');
console.log('-'.repeat(80));

try {
  const { data: marketplaces, error: mpError } = await supabase
    .from('marketplaces')
    .select('id, name, type, last_sync_at, is_active, sync_mode')
    .eq('type', 'ozon');

  if (mpError) {
    console.log('❌ Ошибка:', mpError.message);
  } else if (marketplaces && marketplaces.length > 0) {
    marketplaces.forEach(mp => {
      const lastSync = mp.last_sync_at ? new Date(mp.last_sync_at) : null;
      const now = new Date();
      const minutesAgo = lastSync ? Math.floor((now - lastSync) / 1000 / 60) : null;

      console.log(`\n📊 Маркетплейс: ${mp.name}`);
      console.log(`   ID: ${mp.id}`);
      console.log(`   Активен: ${mp.is_active ? '✅' : '❌'}`);
      console.log(`   Режим синхронизации: ${mp.sync_mode || 'не указан'}`);
      console.log(`   Последняя синхронизация: ${lastSync ? lastSync.toLocaleString('ru-RU') : 'никогда'}`);
      console.log(`   Время с последней синхронизации: ${minutesAgo !== null ? `${minutesAgo} минут назад` : 'н/д'}`);

      if (minutesAgo !== null) {
        if (minutesAgo < 15) {
          console.log(`   Статус: ✅ Работает`);
        } else if (minutesAgo < 60) {
          console.log(`   Статус: ⚠️  Задержка`);
        } else {
          console.log(`   Статус: ❌ Не работает`);
        }
      }
    });
  } else {
    console.log('⚠️  Маркетплейсы Ozon не найдены');
  }
} catch (error) {
  console.log('❌ Ошибка при проверке маркетплейсов:', error.message);
}

// 3. Проверка на дубли
console.log('\n\n3️⃣  ПРОВЕРКА НА ДУБЛИ');
console.log('-'.repeat(80));

try {
  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('id, external_id, is_answered')
    .is('deleted_at', null)
    .limit(1000);

  if (reviewsError) {
    console.log('❌ Ошибка:', reviewsError.message);
  } else {
    // Для каждого отзыва получаем количество ответов
    const reviewIds = reviews.map(r => r.id);

    const { data: replies, error: repliesError } = await supabase
      .from('replies')
      .select('id, review_id, status')
      .in('review_id', reviewIds)
      .is('deleted_at', null);

    if (repliesError) {
      console.log('❌ Ошибка при получении ответов:', repliesError.message);
    } else {
      // Группируем ответы по review_id
      const repliesMap = {};
      replies.forEach(reply => {
        if (!repliesMap[reply.review_id]) {
          repliesMap[reply.review_id] = [];
        }
        repliesMap[reply.review_id].push(reply);
      });

      // Ищем дубли
      const duplicates = [];
      reviews.forEach(review => {
        const reviewReplies = repliesMap[review.id] || [];
        if (reviewReplies.length > 1) {
          duplicates.push({
            review_id: review.id,
            external_id: review.external_id,
            replies_count: reviewReplies.length,
            statuses: reviewReplies.map(r => r.status).join(', ')
          });
        }
      });

      if (duplicates.length > 0) {
        console.log(`❌ НАЙДЕНЫ ДУБЛИ: ${duplicates.length} отзывов с несколькими ответами`);
        console.table(duplicates.slice(0, 10));
      } else {
        console.log('✅ Дублей НЕ НАЙДЕНО');
      }
    }
  }
} catch (error) {
  console.log('❌ Ошибка при проверке дублей:', error.message);
}

// 4. Статистика по отзывам
console.log('\n\n4️⃣  СТАТИСТИКА ПО ОТЗЫВАМ И ОТВЕТАМ');
console.log('-'.repeat(80));

try {
  const { count: totalReviews, error: totalError } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);

  const { count: answeredReviews, error: answeredError } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('is_answered', true)
    .is('deleted_at', null);

  const { count: unansweredSegment, error: unansweredError } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .eq('segment', 'unanswered')
    .is('deleted_at', null);

  const { count: publishedReplies, error: publishedError } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')
    .is('deleted_at', null);

  const { count: draftReplies, error: draftError } = await supabase
    .from('replies')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'drafted')
    .is('deleted_at', null);

  console.log(`\n📊 Общая статистика:`);
  console.log(`   Всего отзывов: ${totalReviews || 0}`);
  console.log(`   Отзывов с ответами (is_answered=true): ${answeredReviews || 0}`);
  console.log(`   Отзывов в сегменте 'unanswered': ${unansweredSegment || 0}`);
  console.log(`   Опубликованных ответов: ${publishedReplies || 0}`);
  console.log(`   Черновиков: ${draftReplies || 0}`);
} catch (error) {
  console.log('❌ Ошибка при получении статистики:', error.message);
}

// 5. Последние отзывы
console.log('\n\n5️⃣  ПОСЛЕДНИЕ 10 ОТЗЫВОВ');
console.log('-'.repeat(80));

try {
  const { data: recentReviews, error: recentError } = await supabase
    .from('reviews')
    .select('id, external_id, created_at, is_answered, segment, rating')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentError) {
    console.log('❌ Ошибка:', recentError.message);
  } else if (recentReviews && recentReviews.length > 0) {
    const reviewsWithReplies = await Promise.all(
      recentReviews.map(async (review) => {
        const { count: repliesCount } = await supabase
          .from('replies')
          .select('*', { count: 'exact', head: true })
          .eq('review_id', review.id)
          .is('deleted_at', null);

        return {
          external_id: review.external_id,
          created: new Date(review.created_at).toLocaleDateString('ru-RU'),
          rating: review.rating,
          is_answered: review.is_answered ? '✅' : '❌',
          segment: review.segment,
          replies: repliesCount || 0
        };
      })
    );

    console.table(reviewsWithReplies);
  } else {
    console.log('⚠️  Отзывы не найдены');
  }
} catch (error) {
  console.log('❌ Ошибка при получении последних отзывов:', error.message);
}

console.log('\n\n' + '='.repeat(80));
console.log('✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
console.log('='.repeat(80));
console.log('');
console.log('📝 Для проверки Edge Functions и cron jobs откройте:');
console.log('   https://supabase.com/dashboard/project/bkmicyguzlwampuindff/logs/edge-functions');
console.log('');
