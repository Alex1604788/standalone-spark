/**
 * 🧪 UNIT ТЕСТЫ ДЛЯ ЛОГИКИ ДЕДУПЛИКАЦИИ
 *
 * Тесты проверяют корректность логики дедупликации расходов
 * без необходимости подключения к БД
 */

// Логика дедупликации из PromotionAnalytics.tsx:268-282
function deduplicateExpenses(performanceData) {
  const campaignDailyExpenses = new Map();

  performanceData.forEach((row) => {
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

  // Подсчитываем общую сумму
  let total = 0;
  campaignDailyExpenses.forEach(dailyMap => {
    const uniqueDailyExpenses = Array.from(dailyMap.values());
    total += uniqueDailyExpenses.reduce((sum, val) => sum + val, 0);
  });

  return { total, campaignDailyExpenses };
}

// Цвета для вывода
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function assertEquals(actual, expected, testName) {
  testsRun++;
  if (actual === expected) {
    testsPassed++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    return true;
  } else {
    testsFailed++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    console.log(`  Expected: ${expected}, Got: ${actual}`);
    return false;
  }
}

function assertClose(actual, expected, tolerance, testName) {
  testsRun++;
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    testsPassed++;
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    return true;
  } else {
    testsFailed++;
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    console.log(`  Expected: ~${expected}, Got: ${actual}, Diff: ${diff}`);
    return false;
  }
}

console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║       🧪 ТЕСТЫ ЛОГИКИ ДЕДУПЛИКАЦИИ РАСХОДОВ 🧪                    ║${colors.reset}`);
console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

// ============================================================================
// ТЕСТ 1: Нет дублирования - должна вернуться та же сумма
// ============================================================================
console.log(`${colors.cyan}Тест 1: Нет дублирования${colors.reset}`);
const test1Data = [
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: "123", stat_date: "2025-12-02", money_spent: 2000 },
  { campaign_id: "123", stat_date: "2025-12-03", money_spent: 1500 },
];
const result1 = deduplicateExpenses(test1Data);
assertEquals(result1.total, 4500, "Сумма без дублирования");

// ============================================================================
// ТЕСТ 2: Простое дублирование - 2 товара, одинаковые расходы
// ============================================================================
console.log(`\n${colors.cyan}Тест 2: Простое дублирование (2 товара)${colors.reset}`);
const test2Data = [
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 1000, sku: "SKU-1" },
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 1000, sku: "SKU-2" },
  { campaign_id: "123", stat_date: "2025-12-02", money_spent: 2000, sku: "SKU-1" },
  { campaign_id: "123", stat_date: "2025-12-02", money_spent: 2000, sku: "SKU-2" },
];
const result2 = deduplicateExpenses(test2Data);
assertEquals(result2.total, 3000, "Сумма с дедупликацией (2 дня × 1000/2000)");

// Проверка что без дедупликации было бы 6000
const rawSum2 = test2Data.reduce((sum, row) => sum + row.money_spent, 0);
assertEquals(rawSum2, 6000, "Сумма БЕЗ дедупликации должна быть 6000");

// ============================================================================
// ТЕСТ 3: Реальный сценарий - кампания "Кабель КГ 2*2,5"
// ============================================================================
console.log(`\n${colors.cyan}Тест 3: Реальный сценарий (5 товаров, 7 дней)${colors.reset}`);
const test3Data = [];
const dailyExpenses = [
  { date: "2025-12-01", expense: 3487.73 },
  { date: "2025-12-02", expense: 3489.59 },
  { date: "2025-12-03", expense: 3489.70 },
  { date: "2025-12-04", expense: 3488.98 },
  { date: "2025-12-05", expense: 3488.82 },
  { date: "2025-12-06", expense: 3487.98 },
  { date: "2025-12-07", expense: 3495.31 },
];
const skus = ["SKU-1", "SKU-2", "SKU-3", "SKU-4", "SKU-5"];

// Генерируем дубликаты как в реальных данных
dailyExpenses.forEach(({ date, expense }) => {
  skus.forEach(sku => {
    test3Data.push({
      campaign_id: "11033377",
      stat_date: date,
      money_spent: expense,
      sku: sku
    });
  });
});

const result3 = deduplicateExpenses(test3Data);
const rawSum3 = test3Data.reduce((sum, row) => sum + row.money_spent, 0);

console.log(`  Записей: ${test3Data.length}`);
console.log(`  Сумма БЕЗ дедупликации: ${rawSum3.toFixed(2)} ₽`);
console.log(`  Сумма С дедупликацией: ${result3.total.toFixed(2)} ₽`);
console.log(`  Экономия: ${((rawSum3 - result3.total) / rawSum3 * 100).toFixed(1)}%`);

assertClose(result3.total, 24428.11, 1, "Сумма за неделю совпадает с OZON (~24 428 ₽)");

// ============================================================================
// ТЕСТ 4: Несколько кампаний
// ============================================================================
console.log(`\n${colors.cyan}Тест 4: Несколько кампаний${colors.reset}`);
const test4Data = [
  { campaign_id: "111", stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: "111", stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: "222", stat_date: "2025-12-01", money_spent: 500 },
  { campaign_id: "222", stat_date: "2025-12-01", money_spent: 500 },
];
const result4 = deduplicateExpenses(test4Data);
assertEquals(result4.total, 1500, "Сумма по двум кампаниям (1000 + 500)");

// ============================================================================
// ТЕСТ 5: NULL campaign_id
// ============================================================================
console.log(`\n${colors.cyan}Тест 5: Записи без campaign_id${colors.reset}`);
const test5Data = [
  { campaign_id: null, stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: "", stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: null, stat_date: "2025-12-02", money_spent: 2000 },
];
const result5 = deduplicateExpenses(test5Data);
assertEquals(result5.total, 3000, "NULL campaign_id группируются вместе");

// ============================================================================
// ТЕСТ 6: Разные значения money_spent в один день (берем MAX)
// ============================================================================
console.log(`\n${colors.cyan}Тест 6: Разные значения в один день (берем MAX)${colors.reset}`);
const test6Data = [
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 1000 },
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 1500 }, // больше
  { campaign_id: "123", stat_date: "2025-12-01", money_spent: 900 },
];
const result6 = deduplicateExpenses(test6Data);
assertEquals(result6.total, 1500, "Берется максимальное значение");

// ============================================================================
// ИТОГИ
// ============================================================================
console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║                       ИТОГИ ТЕСТИРОВАНИЯ                           ║${colors.reset}`);
console.log(`${colors.cyan}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

console.log(`Всего тестов: ${testsRun}`);
console.log(`${colors.green}Пройдено: ${testsPassed}${colors.reset}`);
console.log(`${colors.red}Провалено: ${testsFailed}${colors.reset}`);

const successRate = (testsPassed / testsRun * 100).toFixed(1);
console.log(`\nУспешность: ${successRate}%`);

if (testsFailed === 0) {
  console.log(`\n${colors.green}🎉 Все тесты пройдены! Логика дедупликации работает корректно.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${colors.red}❌ Некоторые тесты провалились. Требуется исправление логики.${colors.reset}\n`);
  process.exit(1);
}
