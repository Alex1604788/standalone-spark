#!/usr/bin/env node

/**
 * АВТОМАТИЧЕСКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES
 * Вызывает PostgreSQL функцию и красиво выводит результаты
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 АВТОМАТИЧЕСКИЙ АНАЛИЗ ТАБЛИЦЫ REPLIES');
console.log('='.repeat(80));
console.log('');

// Создаем клиент
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runAnalysis() {
  try {
    console.log('📡 Подключаюсь к базе данных...');

    // Вызываем функцию анализа
    const { data, error } = await supabase.rpc('analyze_replies_table');

    if (error) {
      console.error('❌ Ошибка:', error.message);
      console.log('');
      console.log('💡 Возможные причины:');
      console.log('   1. Функция analyze_replies_table() не создана');
      console.log('   2. Нет прав на выполнение функции');
      console.log('');
      console.log('🔧 Решение:');
      console.log('   1. Открой Supabase SQL Editor');
      console.log('   2. Выполни скрипт CREATE_ANALYSIS_FUNCTION.sql');
      console.log('   3. Запусти этот скрипт снова');
      console.log('');
      process.exit(1);
    }

    console.log('✅ Данные получены!');
    console.log('');

    // Выводим результаты
    console.log('📊 1. ОБЩАЯ СТАТИСТИКА');
    console.log('-'.repeat(80));
    const stats = data.general_stats;
    console.log(`Всего записей: ${stats.total_records}`);
    console.log(`Самая старая запись: ${stats.oldest_record}`);
    console.log(`Самая новая запись: ${stats.newest_record}`);
    console.log(`Размер таблицы: ${stats.total_size}`);
    console.log('');

    console.log('📈 2. РАСПРЕДЕЛЕНИЕ ПО СТАТУСАМ');
    console.log('-'.repeat(80));
    console.table(data.status_distribution);
    console.log('');

    console.log('🤖 3. РАСПРЕДЕЛЕНИЕ ПО РЕЖИМАМ');
    console.log('-'.repeat(80));
    console.table(data.mode_distribution);
    console.log('');

    console.log('🗓️  4. СТАРЫЕ ЗАПИСИ (> 90 ДНЕЙ)');
    console.log('-'.repeat(80));
    if (data.old_records_90_days && data.old_records_90_days.length > 0) {
      console.table(data.old_records_90_days);
    } else {
      console.log('Нет старых записей');
    }
    console.log('');

    console.log('📅 5. ОЧЕНЬ СТАРЫЕ ЗАПИСИ (> 180 ДНЕЙ)');
    console.log('-'.repeat(80));
    if (data.old_records_180_days && data.old_records_180_days.length > 0) {
      console.table(data.old_records_180_days);
    } else {
      console.log('Нет очень старых записей');
    }
    console.log('');

    console.log('❌ 6. FAILED ЗАПИСИ ПО ПЕРИОДАМ');
    console.log('-'.repeat(80));
    if (data.failed_by_periods && data.failed_by_periods.length > 0) {
      console.table(data.failed_by_periods);
    } else {
      console.log('Нет failed записей');
    }
    console.log('');

    console.log('🧹 7. ПОТЕНЦИАЛ ОЧИСТКИ');
    console.log('-'.repeat(80));
    const cleanup = data.cleanup_potential;

    console.log('\n🔥 ВЫСОКИЙ ПРИОРИТЕТ:');
    console.log(`   Failed > 30 дней: ${cleanup.failed_30_days.count} записей (${cleanup.failed_30_days.space})`);

    console.log('\n⚠️  СРЕДНИЙ ПРИОРИТЕТ:');
    console.log(`   Drafted > 90 дней: ${cleanup.drafted_90_days.count} записей (${cleanup.drafted_90_days.space})`);

    console.log('\n💤 НИЗКИЙ ПРИОРИТЕТ:');
    console.log(`   Published > 180 дней: ${cleanup.published_180_days.count} записей (${cleanup.published_180_days.space})`);
    console.log('');

    console.log('='.repeat(80));
    console.log('💡 РЕКОМЕНДАЦИИ');
    console.log('='.repeat(80));

    const totalCleanable =
      cleanup.failed_30_days.count +
      cleanup.drafted_90_days.count +
      cleanup.published_180_days.count;

    if (totalCleanable > 0) {
      console.log('\n✅ ДЕЙСТВИЯ:');
      if (cleanup.failed_30_days.count > 0) {
        console.log(`\n1️⃣  УДАЛИТЬ ${cleanup.failed_30_days.count} failed записей (освободить ${cleanup.failed_30_days.space})`);
      }
      if (cleanup.drafted_90_days.count > 0) {
        console.log(`2️⃣  УДАЛИТЬ ${cleanup.drafted_90_days.count} drafted записей (освободить ${cleanup.drafted_90_days.space})`);
      }
      if (cleanup.published_180_days.count > 0) {
        console.log(`3️⃣  АРХИВИРОВАТЬ ${cleanup.published_180_days.count} published записей (освободить ${cleanup.published_180_days.space})`);
      }
      console.log('\n4️⃣  Выполнить VACUUM после очистки');
      console.log('5️⃣  Настроить автоматическую очистку');

      console.log('\n🎯 СЛЕДУЮЩИЙ ШАГ: Скажи "ДА" и я создам скрипты для очистки!');
    } else {
      console.log('\n✅ Таблица в хорошем состоянии, очистка не требуется!');
    }

    console.log('');
    console.log(`Анализ выполнен: ${data.analyzed_at}`);
    console.log('');
    console.log('✅ ГОТОВО!');

  } catch (error) {
    console.error('❌ Критическая ошибка:', error.message);
    process.exit(1);
  }
}

runAnalysis();
