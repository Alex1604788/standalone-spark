#!/usr/bin/env node

/**
 * 🔍 ПОЛНАЯ ДИАГНОСТИЧЕСКАЯ СИСТЕМА
 *
 * Автоматизированная проверка всех аспектов проекта:
 * - Подключение к Supabase
 * - Проверка данных в БД
 * - Валидация исправления дедупликации
 * - Проверка синхронизации OZON
 * - Тестирование логики приложения
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Цвета для вывода
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}\n${'='.repeat(70)}`),
};

// Результаты тестов
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

function addTest(name, passed, details = null, isWarning = false) {
  results.tests.push({ name, passed, details, isWarning });
  if (isWarning) {
    results.warnings++;
  } else if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

// ============================================================================
// 1. ПРОВЕРКА ПОДКЛЮЧЕНИЯ
// ============================================================================
async function testConnection() {
  log.section('1. ПРОВЕРКА ПОДКЛЮЧЕНИЯ К SUPABASE');

  try {
    const { data, error } = await supabase
      .from('products')
      .select('id')
      .limit(1);

    if (error) throw error;

    log.success('Подключение к Supabase работает');
    addTest('Supabase Connection', true);
    return true;
  } catch (error) {
    log.error(`Ошибка подключения: ${error.message}`);
    addTest('Supabase Connection', false, error.message);
    return false;
  }
}

// ============================================================================
// 2. ПРОВЕРКА СТРУКТУРЫ ДАННЫХ
// ============================================================================
async function testDataStructure() {
  log.section('2. ПРОВЕРКА СТРУКТУРЫ ДАННЫХ');

  try {
    // Проверяем наличие необходимых таблиц
    const tables = [
      'products',
      'ozon_performance_daily',
      'marketplaces'
    ];

    for (const table of tables) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        log.error(`Таблица ${table} недоступна: ${error.message}`);
        addTest(`Table: ${table}`, false, error.message);
      } else {
        log.success(`Таблица ${table} доступна`);
        addTest(`Table: ${table}`, true);
      }
    }

    // Проверяем VIEW ozon_performance_summary
    const { data: viewData, error: viewError } = await supabase
      .from('ozon_performance_summary')
      .select('*')
      .limit(1);

    if (viewError) {
      log.warning(`VIEW ozon_performance_summary недоступен: ${viewError.message}`);
      addTest('VIEW: ozon_performance_summary', false, viewError.message, true);
    } else {
      log.success('VIEW ozon_performance_summary доступен');
      addTest('VIEW: ozon_performance_summary', true);
    }

  } catch (error) {
    log.error(`Ошибка проверки структуры: ${error.message}`);
  }
}

// ============================================================================
// 3. ПРОВЕРКА ДАННЫХ КАМПАНИИ "КАБЕЛЬ КГ 2*2,5"
// ============================================================================
async function testCampaignData() {
  log.section('3. ПРОВЕРКА ДАННЫХ КАМПАНИИ "КАБЕЛЬ КГ 2*2,5"');

  const campaignName = 'Кабель КГ 2*2,5';

  try {
    // Запрос данных за декабрь 2025
    const { data, error } = await supabase
      .from('ozon_performance_daily')
      .select('stat_date, money_spent, sku, campaign_id')
      .eq('campaign_name', campaignName)
      .gte('stat_date', '2025-12-01')
      .lte('stat_date', '2025-12-31');

    if (error) throw error;

    if (!data || data.length === 0) {
      log.warning(`Нет данных для кампании "${campaignName}" за декабрь 2025`);
      addTest('Campaign Data Exists', false, 'No data found', true);
      return;
    }

    log.success(`Загружено ${data.length} записей`);
    addTest('Campaign Data Exists', true, `${data.length} records`);

    // Анализ дней с данными
    const uniqueDates = new Set(data.map(r => r.stat_date));
    log.info(`Уникальных дат: ${uniqueDates.size} из 31`);

    if (uniqueDates.size < 31) {
      const missingCount = 31 - uniqueDates.size;
      log.warning(`Отсутствует ${missingCount} дней`);
      addTest('Complete December Data', false, `Missing ${missingCount} days`, true);
    } else {
      log.success('Все 31 день декабря присутствуют');
      addTest('Complete December Data', true);
    }

    // Проверка дублирования money_spent по дням
    const byDate = new Map();
    data.forEach(row => {
      const date = row.stat_date;
      if (!byDate.has(date)) {
        byDate.set(date, { records: 0, expenses: [] });
      }
      const info = byDate.get(date);
      info.records++;
      info.expenses.push(Number(row.money_spent || 0));
    });

    let daysWithDuplicates = 0;
    byDate.forEach((info, date) => {
      if (info.records > 1) {
        const allSame = info.expenses.every(e => e === info.expenses[0]);
        if (allSame) {
          daysWithDuplicates++;
        }
      }
    });

    if (daysWithDuplicates > 0) {
      log.info(`Найдено ${daysWithDuplicates} дней с дублированными расходами (ожидаемо)`);
      addTest('Duplicate Expenses Found', true, `${daysWithDuplicates} days`);
    }

    return data;

  } catch (error) {
    log.error(`Ошибка проверки данных кампании: ${error.message}`);
    addTest('Campaign Data Check', false, error.message);
  }
}

// ============================================================================
// 4. ВАЛИДАЦИЯ ДЕДУПЛИКАЦИИ
// ============================================================================
async function testDeduplication() {
  log.section('4. ВАЛИДАЦИЯ ЛОГИКИ ДЕДУПЛИКАЦИИ');

  const campaignName = 'Кабель КГ 2*2,5';

  try {
    // Загружаем данные
    const { data, error } = await supabase
      .from('ozon_performance_daily')
      .select('stat_date, money_spent, campaign_id')
      .eq('campaign_name', campaignName)
      .gte('stat_date', '2025-12-01')
      .lte('stat_date', '2025-12-31');

    if (error) throw error;
    if (!data || data.length === 0) {
      log.warning('Нет данных для тестирования дедупликации');
      return;
    }

    // Реализуем логику дедупликации (как в PromotionAnalytics.tsx:268-282)
    const campaignDailyExpenses = new Map();

    data.forEach(row => {
      const campaignId = (!row.campaign_id || row.campaign_id === "")
        ? "__NO_CAMPAIGN__"
        : String(row.campaign_id);
      const date = row.stat_date;

      if (!campaignDailyExpenses.has(campaignId)) {
        campaignDailyExpenses.set(campaignId, new Map());
      }

      const dailyMap = campaignDailyExpenses.get(campaignId);
      dailyMap.set(date, Math.max(dailyMap.get(date) || 0, Number(row.money_spent || 0)));
    });

    // Вычисляем суммы
    let totalDeduped = 0;
    let totalRaw = 0;

    campaignDailyExpenses.forEach(dailyMap => {
      const uniqueDailyExpenses = Array.from(dailyMap.values());
      totalDeduped += uniqueDailyExpenses.reduce((sum, val) => sum + val, 0);
    });

    data.forEach(row => {
      totalRaw += Number(row.money_spent || 0);
    });

    log.info(`Сумма БЕЗ дедупликации: ${totalRaw.toFixed(2)} ₽`);
    log.info(`Сумма С дедупликацией: ${totalDeduped.toFixed(2)} ₽`);

    // Проверка за неделю (1-7 декабря)
    const weekData = data.filter(r => r.stat_date >= '2025-12-01' && r.stat_date <= '2025-12-07');
    const weekDailyMap = new Map();
    weekData.forEach(row => {
      const date = row.stat_date;
      weekDailyMap.set(date, Math.max(weekDailyMap.get(date) || 0, Number(row.money_spent || 0)));
    });
    const weekTotal = Array.from(weekDailyMap.values()).reduce((sum, val) => sum + val, 0);

    log.info(`За неделю (1-7 дек): ${weekTotal.toFixed(2)} ₽ (ожидается ~24 428 ₽)`);

    const weekMatch = Math.abs(weekTotal - 24428) < 100;
    if (weekMatch) {
      log.success('Расходы за неделю совпадают с OZON ✓');
      addTest('Week Expenses Match', true, `${weekTotal.toFixed(2)} ₽`);
    } else {
      log.error(`Расходы за неделю НЕ совпадают (разница: ${(weekTotal - 24428).toFixed(2)} ₽)`);
      addTest('Week Expenses Match', false, `Expected: 24428, Got: ${weekTotal.toFixed(2)}`);
    }

    // Проверка за месяц
    const expectedMonth = 109130;
    log.info(`За месяц (1-31 дек): ${totalDeduped.toFixed(2)} ₽ (ожидается ~${expectedMonth} ₽)`);

    const monthMatch = Math.abs(totalDeduped - expectedMonth) < 100;
    if (monthMatch) {
      log.success('Расходы за месяц совпадают с OZON ✓');
      addTest('Month Expenses Match', true, `${totalDeduped.toFixed(2)} ₽`);
    } else {
      const diff = totalDeduped - expectedMonth;
      log.warning(`Расходы за месяц отличаются на ${diff.toFixed(2)} ₽`);
      addTest('Month Expenses Match', false, `Expected: ${expectedMonth}, Got: ${totalDeduped.toFixed(2)}`, true);
    }

    // Проверка, что дедупликация действительно что-то делает
    const deduplicationEffect = ((totalRaw - totalDeduped) / totalRaw * 100);
    if (deduplicationEffect > 1) {
      log.success(`Дедупликация работает: уменьшение на ${deduplicationEffect.toFixed(1)}%`);
      addTest('Deduplication Active', true, `${deduplicationEffect.toFixed(1)}% reduction`);
    } else {
      log.warning('Дедупликация не оказывает эффекта (возможно нет дублей)');
      addTest('Deduplication Active', false, 'No effect', true);
    }

  } catch (error) {
    log.error(`Ошибка валидации дедупликации: ${error.message}`);
    addTest('Deduplication Validation', false, error.message);
  }
}

// ============================================================================
// 5. ПРОВЕРКА СИНХРОНИЗАЦИИ OZON
// ============================================================================
async function testOzonSync() {
  log.section('5. ПРОВЕРКА СИНХРОНИЗАЦИИ OZON');

  try {
    // Проверяем последнюю дату синхронизации
    const { data, error } = await supabase
      .from('ozon_performance_daily')
      .select('stat_date')
      .order('stat_date', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      const lastDate = data[0].stat_date;
      const daysSinceSync = Math.floor((new Date() - new Date(lastDate)) / (1000 * 60 * 60 * 24));

      log.info(`Последняя дата в БД: ${lastDate}`);
      log.info(`Дней с последней синхронизации: ${daysSinceSync}`);

      if (daysSinceSync <= 2) {
        log.success('Данные актуальные');
        addTest('Data Freshness', true, `Last sync: ${lastDate}`);
      } else {
        log.warning(`Данные устарели (${daysSinceSync} дней)`);
        addTest('Data Freshness', false, `Last sync: ${lastDate}, ${daysSinceSync} days ago`, true);
      }
    } else {
      log.error('Нет данных синхронизации');
      addTest('Sync Data Exists', false);
    }

  } catch (error) {
    log.error(`Ошибка проверки синхронизации: ${error.message}`);
    addTest('Sync Check', false, error.message);
  }
}

// ============================================================================
// 6. ИТОГОВЫЙ ОТЧЕТ
// ============================================================================
function printReport() {
  log.section('6. ИТОГОВЫЙ ОТЧЕТ');

  console.log(`\n${colors.bright}Результаты тестирования:${colors.reset}`);
  console.log(`${colors.green}✓ Пройдено:${colors.reset} ${results.passed}`);
  console.log(`${colors.red}✗ Провалено:${colors.reset} ${results.failed}`);
  console.log(`${colors.yellow}⚠ Предупреждения:${colors.reset} ${results.warnings}`);
  console.log(`Всего тестов: ${results.tests.length}\n`);

  if (results.failed > 0) {
    console.log(`${colors.bright}${colors.red}Провалившиеся тесты:${colors.reset}`);
    results.tests
      .filter(t => !t.passed && !t.isWarning)
      .forEach(t => {
        console.log(`  ${colors.red}✗${colors.reset} ${t.name}`);
        if (t.details) console.log(`    ${colors.red}└─${colors.reset} ${t.details}`);
      });
    console.log();
  }

  if (results.warnings > 0) {
    console.log(`${colors.bright}${colors.yellow}Предупреждения:${colors.reset}`);
    results.tests
      .filter(t => t.isWarning)
      .forEach(t => {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${t.name}`);
        if (t.details) console.log(`    ${colors.yellow}└─${colors.reset} ${t.details}`);
      });
    console.log();
  }

  const healthScore = Math.round((results.passed / (results.passed + results.failed)) * 100);
  console.log(`${colors.bright}Оценка здоровья системы: ${healthScore}%${colors.reset}`);

  if (healthScore >= 90) {
    console.log(`${colors.green}🎉 Отличное состояние!${colors.reset}\n`);
  } else if (healthScore >= 70) {
    console.log(`${colors.yellow}⚠️  Требуется внимание${colors.reset}\n`);
  } else {
    console.log(`${colors.red}🚨 Критическое состояние!${colors.reset}\n`);
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log(`
${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗
║         🔍 ДИАГНОСТИЧЕСКАЯ СИСТЕМА STANDALONE-SPARK 🔍            ║
╚════════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const connected = await testConnection();
  if (!connected) {
    log.error('Невозможно продолжить без подключения к Supabase');
    process.exit(1);
  }

  await testDataStructure();
  await testCampaignData();
  await testDeduplication();
  await testOzonSync();

  printReport();

  // Exit code на основе результатов
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(error => {
  log.error(`Критическая ошибка: ${error.message}`);
  console.error(error);
  process.exit(1);
});
