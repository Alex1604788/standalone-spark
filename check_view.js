import pg from 'pg';
const { Client } = pg;

// Supabase connection string
// Формат: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
// Для прямого подключения используем порт 5432
const connectionString = process.env.DATABASE_URL ||
  'postgresql://postgres.bkmicyguzlwampuindff:[YOUR-DB-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

async function checkDatabase() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Подключение к базе данных успешно\n');

    // Проверка существования VIEW
    console.log('📊 Проверка существования VIEW ozon_performance_summary...');
    const viewExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM pg_views
        WHERE schemaname = 'public'
        AND viewname = 'ozon_performance_summary'
      ) as exists;
    `);
    console.log('VIEW существует:', viewExists.rows[0].exists);

    if (!viewExists.rows[0].exists) {
      console.log('❌ VIEW не создан! Нужно применить миграцию.');
      return;
    }

    // Проверка данных в базовой таблице
    console.log('\n📊 Проверка данных в таблице ozon_performance_daily...');
    const tableData = await client.query(`
      SELECT
        COUNT(*) as total_rows,
        COUNT(DISTINCT marketplace_id) as marketplaces,
        MIN(stat_date) as earliest_date,
        MAX(stat_date) as latest_date,
        SUM(orders) as sum_orders,
        SUM(orders_model) as sum_orders_model,
        SUM(revenue) as sum_revenue,
        SUM(revenue_model) as sum_revenue_model
      FROM ozon_performance_daily;
    `);

    console.log('Всего строк:', tableData.rows[0].total_rows);
    console.log('Маркетплейсов:', tableData.rows[0].marketplaces);
    console.log('Период данных:', tableData.rows[0].earliest_date, '-', tableData.rows[0].latest_date);
    console.log('\nСуммы в исходной таблице:');
    console.log('  orders:', tableData.rows[0].sum_orders);
    console.log('  orders_model:', tableData.rows[0].sum_orders_model);
    console.log('  revenue:', tableData.rows[0].sum_revenue);
    console.log('  revenue_model:', tableData.rows[0].sum_revenue_model);

    // Проверка VIEW
    console.log('\n📊 Проверка данных через VIEW ozon_performance_summary...');
    const viewData = await client.query(`
      SELECT
        COUNT(*) as total_rows,
        SUM(total_orders) as sum_total_orders,
        SUM(total_revenue) as sum_total_revenue,
        SUM(orders) as sum_orders,
        SUM(orders_model) as sum_orders_model,
        SUM(revenue) as sum_revenue,
        SUM(revenue_model) as sum_revenue_model
      FROM ozon_performance_summary;
    `);

    console.log('Всего строк в VIEW:', viewData.rows[0].total_rows);
    console.log('\nСуммы через VIEW:');
    console.log('  total_orders (orders + orders_model):', viewData.rows[0].sum_total_orders);
    console.log('  total_revenue (revenue + revenue_model):', viewData.rows[0].sum_total_revenue);
    console.log('\nРазбивка:');
    console.log('  orders:', viewData.rows[0].sum_orders);
    console.log('  orders_model:', viewData.rows[0].sum_orders_model);
    console.log('  revenue:', viewData.rows[0].sum_revenue);
    console.log('  revenue_model:', viewData.rows[0].sum_revenue_model);

    // Примеры данных
    console.log('\n📊 Примеры данных из VIEW (последние 5 записей):');
    const sampleData = await client.query(`
      SELECT
        stat_date,
        sku,
        campaign_name,
        orders,
        orders_model,
        total_orders,
        revenue,
        revenue_model,
        total_revenue,
        money_spent
      FROM ozon_performance_summary
      ORDER BY stat_date DESC, id DESC
      LIMIT 5;
    `);

    console.table(sampleData.rows);

    // Проверка что VIEW действительно суммирует
    console.log('\n✅ Проверка корректности суммирования:');
    const validation = await client.query(`
      SELECT
        stat_date,
        sku,
        orders,
        orders_model,
        total_orders,
        (orders + COALESCE(orders_model, 0)) as expected_total_orders,
        total_orders = (orders + COALESCE(orders_model, 0)) as orders_match,
        revenue,
        revenue_model,
        total_revenue,
        (revenue + COALESCE(revenue_model, 0)) as expected_total_revenue,
        total_revenue = (revenue + COALESCE(revenue_model, 0)) as revenue_match
      FROM ozon_performance_summary
      WHERE orders_model IS NOT NULL OR revenue_model IS NOT NULL
      LIMIT 5;
    `);

    if (validation.rows.length > 0) {
      console.log('Примеры с orders_model/revenue_model:');
      console.table(validation.rows);
    } else {
      console.log('⚠️ Нет записей с orders_model или revenue_model');
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('Детали:', error);
  } finally {
    await client.end();
  }
}

checkDatabase();
