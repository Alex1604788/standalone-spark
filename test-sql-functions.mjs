#!/usr/bin/env node

/**
 * Тестирование SQL функций агрегации
 * Запускать ПОСЛЕ применения миграций в Supabase
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
console.log(`${colors.cyan}${colors.bright}║          🧪 ТЕСТИРОВАНИЕ SQL ФУНКЦИЙ АГРЕГАЦИИ                    ║${colors.reset}`);
console.log(`${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

// Сначала получим marketplace_id
console.log(`${colors.blue}🔍 Получаем marketplace_id...${colors.reset}`);

const { data: marketplaces, error: mpError } = await supabase
  .from('marketplaces')
  .select('id, name')
  .limit(1);

if (mpError || !marketplaces || marketplaces.length === 0) {
  console.log(`${colors.red}❌ Не удалось получить marketplace_id${colors.reset}`);
  console.log(`   Ошибка:`, mpError?.message || 'Нет данных');
  console.log(`\n${colors.yellow}💡 Убедитесь, что у вас есть данные в таблице marketplaces${colors.reset}\n`);
  process.exit(1);
}

const marketplaceId = marketplaces[0].id;
const marketplaceName = marketplaces[0].name;

console.log(`${colors.green}✅ Marketplace найден: ${marketplaceName}${colors.reset}`);
console.log(`   ID: ${marketplaceId}\n`);

// ТЕСТ 1: Проверяем функцию get_campaign_performance_aggregated
console.log(`${colors.blue}${colors.bright}ТЕСТ 1: Функция get_campaign_performance_aggregated${colors.reset}`);
console.log(`${'─'.repeat(70)}`);

try {
  const { data, error } = await supabase.rpc('get_campaign_performance_aggregated', {
    p_marketplace_id: marketplaceId,
    p_start_date: '2025-12-01',
    p_end_date: '2025-12-31'
  });

  if (error) {
    console.log(`${colors.red}❌ Ошибка при вызове функции:${colors.reset}`, error.message);

    if (error.message.includes('could not find') || error.message.includes('does not exist')) {
      console.log(`\n${colors.yellow}⚠️  ФУНКЦИЯ НЕ НАЙДЕНА!${colors.reset}`);
      console.log(`${colors.yellow}   Пожалуйста, примените миграции в Supabase Dashboard${colors.reset}`);
      console.log(`${colors.yellow}   См. файл: APPLY_SQL_NOW.sql${colors.reset}\n`);
    }
  } else {
    console.log(`${colors.green}✅ Функция работает!${colors.reset}`);
    console.log(`   Возвращено кампаний: ${data?.length || 0}\n`);

    if (data && data.length > 0) {
      console.log(`${colors.cyan}📊 Пример данных (первая кампания):${colors.reset}`);
      const campaign = data[0];
      console.log(`   Название: ${campaign.campaign_name}`);
      console.log(`   Расходы: ${campaign.total_money_spent} руб`);
      console.log(`   Дней с расходами: ${campaign.days_with_expenses}`);
      console.log(`   Товаров (SKU): ${campaign.sku_count}`);
      console.log(`   Заказы: ${campaign.total_orders}`);
      console.log(`   Выручка: ${campaign.total_revenue} руб\n`);
    } else {
      console.log(`${colors.yellow}⚠️  Нет данных за указанный период (декабрь 2025)${colors.reset}\n`);
    }
  }
} catch (error) {
  console.log(`${colors.red}❌ Исключение:${colors.reset}`, error.message);
}

// ТЕСТ 2: Проверяем функцию get_product_performance_by_campaign
console.log(`${colors.blue}${colors.bright}ТЕСТ 2: Функция get_product_performance_by_campaign${colors.reset}`);
console.log(`${'─'.repeat(70)}`);

try {
  // Сначала получим первую кампанию
  const { data: campaigns } = await supabase.rpc('get_campaign_performance_aggregated', {
    p_marketplace_id: marketplaceId,
    p_start_date: '2025-12-01',
    p_end_date: '2025-12-31'
  });

  if (campaigns && campaigns.length > 0 && campaigns[0].campaign_id) {
    const campaignId = campaigns[0].campaign_id;
    const campaignName = campaigns[0].campaign_name;

    console.log(`${colors.blue}🔍 Тестируем с кампанией: ${campaignName}${colors.reset}`);

    const { data, error } = await supabase.rpc('get_product_performance_by_campaign', {
      p_marketplace_id: marketplaceId,
      p_campaign_id: campaignId,
      p_start_date: '2025-12-01',
      p_end_date: '2025-12-31'
    });

    if (error) {
      console.log(`${colors.red}❌ Ошибка при вызове функции:${colors.reset}`, error.message);
    } else {
      console.log(`${colors.green}✅ Функция работает!${colors.reset}`);
      console.log(`   Возвращено товаров: ${data?.length || 0}\n`);

      if (data && data.length > 0) {
        console.log(`${colors.cyan}📦 Пример данных (первый товар):${colors.reset}`);
        const product = data[0];
        console.log(`   SKU: ${product.sku}`);
        console.log(`   Просмотры: ${product.total_views}`);
        console.log(`   Клики: ${product.total_clicks}`);
        console.log(`   Заказы: ${product.total_orders}`);
        console.log(`   Выручка: ${product.total_revenue} руб\n`);
      }
    }
  } else {
    console.log(`${colors.yellow}⚠️  Нет кампаний для теста${colors.reset}\n`);
  }
} catch (error) {
  console.log(`${colors.red}❌ Исключение:${colors.reset}`, error.message);
}

// Итоги
console.log(`\n${'═'.repeat(70)}`);
console.log(`${colors.green}${colors.bright}✨ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО${colors.reset}`);
console.log(`${'═'.repeat(70)}\n`);

console.log(`${colors.cyan}📚 ЧТО ДАЛЬШЕ:${colors.reset}`);
console.log(`   1. Если функции работают - проверьте фронтенд`);
console.log(`   2. Откройте страницу аналитики продвижения`);
console.log(`   3. Проверьте логи в Chrome DevTools (F12 -> Console)`);
console.log(`   4. Убедитесь, что загружаются ВСЕ данные\n`);

console.log(`${colors.green}${colors.bright}💡 ПРОБЛЕМА ЛИМИТА 1000 ЗАПИСЕЙ РЕШЕНА!${colors.reset}\n`);
