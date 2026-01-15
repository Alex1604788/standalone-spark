#!/usr/bin/env node

/**
 * 🔍 ПРОВЕРКА РАСХОДОВ В БД
 * Выполняет SQL запросы для диагностики проблемы
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://bkmicyguzlwampuindff.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrbWljeWd1emx3YW1wdWluZGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2OTUwMjMsImV4cCI6MjA4MDI3MTAyM30.v8BlZ_k8DxdSmh5Ao1da7GHurSshE1cBsMxdfQCp9PQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

console.log(`\n${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}║           🔍 ДИАГНОСТИКА РАСХОДОВ В БД 🔍                         ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

const campaignName = 'Кабель КГ 2*2,5';

// ============================================================================
// ЗАПРОС 1: Проверка данных за декабрь
// ============================================================================
console.log(`${colors.bright}${colors.blue}ЗАПРОС 1: Проверка данных за декабрь 2025${colors.reset}`);
console.log('='.repeat(70));

const { data: decemberData, error: decemberError } = await supabase
  .from('ozon_performance_daily')
  .select('stat_date, money_spent, sku, campaign_id')
  .eq('campaign_name', campaignName)
  .gte('stat_date', '2025-12-01')
  .lte('stat_date', '2025-12-31')
  .order('stat_date', { ascending: true });

if (decemberError) {
  console.log(`${colors.red}❌ Ошибка: ${decemberError.message}${colors.reset}`);
  process.exit(1);
}

if (!decemberData || decemberData.length === 0) {
  console.log(`${colors.red}❌ Нет данных для кампании "${campaignName}" за декабрь 2025${colors.reset}`);
  process.exit(1);
}

console.log(`${colors.green}✓${colors.reset} Загружено записей: ${decemberData.length}`);

// Считаем уникальные даты
const uniqueDates = new Set(decemberData.map(r => r.stat_date));
console.log(`${colors.green}✓${colors.reset} Уникальных дат: ${uniqueDates.size} из 31`);

if (uniqueDates.size < 31) {
  console.log(`${colors.yellow}⚠${colors.reset} ВНИМАНИЕ: Отсутствует ${31 - uniqueDates.size} дней!\n`);

  // Найдем какие даты отсутствуют
  const allDates = [];
  for (let day = 1; day <= 31; day++) {
    allDates.push(`2025-12-${String(day).padStart(2, '0')}`);
  }
  const missingDates = allDates.filter(date => !uniqueDates.has(date));

  if (missingDates.length > 0 && missingDates.length <= 10) {
    console.log(`${colors.yellow}Отсутствующие даты:${colors.reset}`);
    missingDates.forEach(date => console.log(`  - ${date}`));
  } else if (missingDates.length > 10) {
    console.log(`${colors.yellow}Отсутствует ${missingDates.length} дат (слишком много для вывода)${colors.reset}`);
  }
  console.log();
}

// ============================================================================
// ЗАПРОС 2: Подсчет с дедупликацией (правильный метод)
// ============================================================================
console.log(`${colors.bright}${colors.blue}ЗАПРОС 2: Расходы С дедупликацией (правильный метод)${colors.reset}`);
console.log('='.repeat(70));

// Группируем по дате и берем MAX money_spent
const dailyExpenses = new Map();
decemberData.forEach(row => {
  const date = row.stat_date;
  const expense = Number(row.money_spent || 0);
  dailyExpenses.set(date, Math.max(dailyExpenses.get(date) || 0, expense));
});

const totalWithDedup = Array.from(dailyExpenses.values()).reduce((sum, val) => sum + val, 0);

console.log(`${colors.green}✓${colors.reset} Дней с данными: ${dailyExpenses.size}`);
console.log(`${colors.green}✓${colors.reset} Сумма с дедупликацией: ${colors.bright}${totalWithDedup.toFixed(2)} ₽${colors.reset}`);
console.log(`${colors.blue}ℹ${colors.reset} Ожидается: ~109 130 ₽`);

const diff = totalWithDedup - 109130;
const diffPercent = (Math.abs(diff) / 109130 * 100).toFixed(1);

if (Math.abs(diff) < 100) {
  console.log(`${colors.green}✅ СОВПАДАЕТ с OZON!${colors.reset}\n`);
} else if (Math.abs(diff) < 1000) {
  console.log(`${colors.yellow}⚠ Близко к ожидаемому (разница: ${diff.toFixed(2)} ₽, ${diffPercent}%)${colors.reset}\n`);
} else {
  console.log(`${colors.red}❌ НЕ СОВПАДАЕТ! Разница: ${diff.toFixed(2)} ₽ (${diffPercent}%)${colors.reset}\n`);
}

// ============================================================================
// ЗАПРОС 3: Расходы БЕЗ дедупликации (для сравнения)
// ============================================================================
console.log(`${colors.bright}${colors.blue}ЗАПРОС 3: Расходы БЕЗ дедупликации (для сравнения)${colors.reset}`);
console.log('='.repeat(70));

const totalWithoutDedup = decemberData.reduce((sum, row) => sum + Number(row.money_spent || 0), 0);

console.log(`${colors.yellow}⚠${colors.reset} Сумма БЕЗ дедупликации: ${colors.bright}${totalWithoutDedup.toFixed(2)} ₽${colors.reset}`);

const dupFactor = (totalWithoutDedup / totalWithDedup).toFixed(1);
console.log(`${colors.blue}ℹ${colors.reset} Коэффициент дублирования: ${dupFactor}x`);

if (totalWithoutDedup > totalWithDedup) {
  const dupAmount = totalWithoutDedup - totalWithDedup;
  console.log(`${colors.yellow}⚠${colors.reset} Дублирование составляет: ${dupAmount.toFixed(2)} ₽\n`);
} else {
  console.log(`${colors.green}✓${colors.reset} Дублирования нет\n`);
}

// ============================================================================
// ЗАПРОС 4: Проверка за неделю (1-7 декабря)
// ============================================================================
console.log(`${colors.bright}${colors.blue}ЗАПРОС 4: Проверка за неделю (1-7 декабря)${colors.reset}`);
console.log('='.repeat(70));

const weekData = decemberData.filter(r => r.stat_date >= '2025-12-01' && r.stat_date <= '2025-12-07');
const weekDailyExpenses = new Map();

weekData.forEach(row => {
  const date = row.stat_date;
  const expense = Number(row.money_spent || 0);
  weekDailyExpenses.set(date, Math.max(weekDailyExpenses.get(date) || 0, expense));
});

const weekTotal = Array.from(weekDailyExpenses.values()).reduce((sum, val) => sum + val, 0);

console.log(`${colors.green}✓${colors.reset} Дней: ${weekDailyExpenses.size}`);
console.log(`${colors.green}✓${colors.reset} Сумма за неделю: ${colors.bright}${weekTotal.toFixed(2)} ₽${colors.reset}`);
console.log(`${colors.blue}ℹ${colors.reset} Ожидается: ~24 428 ₽`);

const weekDiff = weekTotal - 24428;
if (Math.abs(weekDiff) < 100) {
  console.log(`${colors.green}✅ СОВПАДАЕТ с OZON!${colors.reset}\n`);
} else {
  console.log(`${colors.yellow}⚠ Разница: ${weekDiff.toFixed(2)} ₽${colors.reset}\n`);
}

// ============================================================================
// ЗАПРОС 5: Детальная разбивка по дням
// ============================================================================
console.log(`${colors.bright}${colors.blue}ЗАПРОС 5: Детальная разбивка по дням${colors.reset}`);
console.log('='.repeat(70));

const byDate = new Map();
decemberData.forEach(row => {
  const date = row.stat_date;
  if (!byDate.has(date)) {
    byDate.set(date, { records: 0, expenses: [], skus: new Set() });
  }
  const info = byDate.get(date);
  info.records++;
  info.expenses.push(Number(row.money_spent || 0));
  if (row.sku) info.skus.add(row.sku);
});

console.log(`\nДата       | Расходы    | Записей | SKU | Одинаковые?`);
console.log('-'.repeat(70));

let displayCount = 0;
Array.from(byDate.entries()).sort().forEach(([date, info]) => {
  const maxExpense = Math.max(...info.expenses);
  const minExpense = Math.min(...info.expenses);
  const allSame = maxExpense === minExpense ? '✅' : '❌';

  // Показываем первые 10 и последние 3 дня
  if (displayCount < 10 || displayCount >= byDate.size - 3) {
    console.log(
      `${date} | ${maxExpense.toFixed(2).padStart(9)} ₽ | ${String(info.records).padStart(7)} | ${String(info.skus.size).padStart(3)} | ${allSame}`
    );
  } else if (displayCount === 10) {
    console.log('  ...');
  }
  displayCount++;
});

console.log();

// ============================================================================
// ИТОГИ
// ============================================================================
console.log(`${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}║                           ИТОГИ                                    ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

console.log(`📊 ${colors.bright}ДАННЫЕ В БД:${colors.reset}`);
console.log(`   Записей всего: ${decemberData.length}`);
console.log(`   Уникальных дат: ${uniqueDates.size} из 31`);
console.log(`   Товаров (SKU): ${new Set(decemberData.filter(r => r.sku).map(r => r.sku)).size}`);
console.log();

console.log(`💰 ${colors.bright}РАСХОДЫ ЗА МЕСЯЦ (1-31 декабря):${colors.reset}`);
console.log(`   БЕЗ дедупликации: ${totalWithoutDedup.toFixed(2)} ₽`);
console.log(`   ${colors.bright}С дедупликацией:  ${totalWithDedup.toFixed(2)} ₽${colors.reset} ${Math.abs(totalWithDedup - 109130) < 100 ? '✅' : '❌'}`);
console.log(`   Ожидается:        ~109 130.00 ₽`);
console.log(`   Разница:          ${(totalWithDedup - 109130).toFixed(2)} ₽`);
console.log();

console.log(`💰 ${colors.bright}РАСХОДЫ ЗА НЕДЕЛЮ (1-7 декабря):${colors.reset}`);
console.log(`   ${colors.bright}С дедупликацией:  ${weekTotal.toFixed(2)} ₽${colors.reset} ${Math.abs(weekTotal - 24428) < 100 ? '✅' : '❌'}`);
console.log(`   Ожидается:        ~24 428.00 ₽`);
console.log(`   Разница:          ${(weekTotal - 24428).toFixed(2)} ₽`);
console.log();

// ВЫВОДЫ
console.log(`🔍 ${colors.bright}ВЫВОДЫ:${colors.reset}`);

if (uniqueDates.size < 31) {
  console.log(`   ${colors.red}❌ ПРОБЛЕМА: Не все дни декабря загружены в БД${colors.reset}`);
  console.log(`      Отсутствует ${31 - uniqueDates.size} дней`);
  console.log(`      ${colors.yellow}Решение: Запустить синхронизацию OZON для недостающих дат${colors.reset}`);
} else if (Math.abs(totalWithDedup - 109130) < 100) {
  console.log(`   ${colors.green}✅ ДАННЫЕ В БД КОРРЕКТНЫЕ!${colors.reset}`);
  console.log(`      Расходы с дедупликацией совпадают с OZON`);
  console.log(`      ${colors.yellow}Если приложение показывает другие цифры - проблема в frontend коде${colors.reset}`);
} else {
  console.log(`   ${colors.yellow}⚠ РАСХОЖДЕНИЕ С OZON${colors.reset}`);
  console.log(`      Разница: ${(totalWithDedup - 109130).toFixed(2)} ₽`);
  console.log(`      ${colors.yellow}Возможно нужна более глубокая диагностика${colors.reset}`);
}

console.log();
