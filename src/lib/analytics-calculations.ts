/**
 * Библиотека расчётов аналитики Ozon
 * Использует реальные метрики Ozon API /v1/analytics/data (dimension=sku+day)
 */

// ============================================================
// ТИПЫ — точно соответствуют колонкам БД ozon_analytics_daily
// ============================================================

export interface OzonDailyRow {
  offer_id: string;           // Артикул продавца (из маппинга sku→offer_id)
  product_name?: string;      // Название товара (из dimension.name)
  date: string;

  // Заказы / выкупы
  ordered_units: number | null;       // Заказано штук
  revenue: number | null;             // Выручка от заказов (руб)
  cancellations: number | null;       // Отмены
  returns: number | null;             // Возвраты
  bought_in_ozon_orders: number | null; // Выкуплено штук (факт)

  // Трафик
  session_view: number | null;        // Сессии с просмотром товара
  session_view_pdp: number | null;    // Просмотры карточки (PDP)
  hits_view: number | null;           // Всего просмотров (хиты)

  // Конверсия
  conv_tocart_pdp: number | null;     // % PDP→корзина
  conv_topurchase_pdp: number | null; // % PDP→покупка

  // Обогащение из других таблиц
  fbo_stocks?: number | null;
  fbs_stocks?: number | null;
  cost_price?: number | null;
}

export interface ProductMetrics {
  offer_id: string;
  product_name?: string;

  // Продажи
  ordered_units: number;        // Заказано штук
  revenue: number;              // Выручка от заказов
  bought_in_ozon_orders: number;// Выкуплено штук
  cancellations: number;        // Отмены
  returns: number;              // Возвраты
  redemption_rate: number;      // % выкупа = bought / ordered * 100
  cancellation_rate: number;    // % отмены
  return_rate: number;          // % возврата

  // Трафик
  session_view: number;         // Сессии с просмотром
  session_view_pdp: number;     // Просмотры карточки
  hits_view: number;            // Всего просмотров

  // Конверсия (среднее за период)
  conv_tocart_pdp: number;      // % PDP→корзина
  conv_topurchase_pdp: number;  // % PDP→покупка

  // Остатки (последний день периода)
  fbo_stocks: number;
  fbs_stocks: number;
  turnover_days: number;        // (fbo+fbs) / ср.заказов_в_нед * 7
  fbo_days: number;             // fbo / ср.заказов_в_нед * 7

  // Доходность (только если есть себестоимость)
  cost_price_unit: number;
  cost_price_total: number;
  profit: number;               // revenue - себестоимость (упрощённо)
  profit_unit: number;
  margin_percent: number;       // (price - cost) / price * 100
  ros_percent: number;          // profit / revenue * 100

  // Вспомогательные
  days_count: number;
  revenue_per_unit: number;     // revenue / ordered_units (средняя цена)

  // Timeseries для графиков
  daily?: DailyPoint[];
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ============================================================

function n(v: number | null | undefined): number {
  return v ?? 0;
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

// ============================================================
// АГРЕГАЦИЯ ПО ТОВАРУ (несколько дней → одна запись)
// ============================================================

export function aggregateToProductMetrics(
  rows: OzonDailyRow[]
): ProductMetrics[] {
  const grouped = new Map<string, OzonDailyRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.offer_id)) grouped.set(row.offer_id, []);
    grouped.get(row.offer_id)!.push(row);
  }

  return Array.from(grouped.entries()).map(([offer_id, rr]) => {
    // Суммируем счётчики
    const ordered_units = rr.reduce((s, r) => s + n(r.ordered_units), 0);
    const revenue = rr.reduce((s, r) => s + n(r.revenue), 0);
    const bought_in_ozon_orders = rr.reduce((s, r) => s + n(r.bought_in_ozon_orders), 0);
    const cancellations = rr.reduce((s, r) => s + n(r.cancellations), 0);
    const returns = rr.reduce((s, r) => s + n(r.returns), 0);
    const session_view = rr.reduce((s, r) => s + n(r.session_view), 0);
    const session_view_pdp = rr.reduce((s, r) => s + n(r.session_view_pdp), 0);
    const hits_view = rr.reduce((s, r) => s + n(r.hits_view), 0);

    // Усредняем конверсии (только дни с данными)
    const cartRows = rr.filter((r) => r.conv_tocart_pdp != null);
    const buyRows = rr.filter((r) => r.conv_topurchase_pdp != null);
    const conv_tocart_pdp = avg(cartRows.map((r) => n(r.conv_tocart_pdp)));
    const conv_topurchase_pdp = avg(buyRows.map((r) => n(r.conv_topurchase_pdp)));

    // Последний известный остаток
    const lastRow = [...rr].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fbo_stocks = n(lastRow.fbo_stocks);
    const fbs_stocks = n(lastRow.fbs_stocks);

    // Себестоимость
    const costRow = [...rr].reverse().find((r) => r.cost_price != null);
    const cost_price_unit = n(costRow?.cost_price);
    const cost_price_total = cost_price_unit * bought_in_ozon_orders;

    // Оборачиваемость
    const days_count = rr.length || 1;
    const avg_daily_ordered = ordered_units / days_count;
    const avg_weekly_ordered = avg_daily_ordered * 7;
    const total_stocks = fbo_stocks + fbs_stocks;
    const turnover_days = avg_daily_ordered > 0 ? total_stocks / avg_daily_ordered : 0;
    const fbo_days = avg_daily_ordered > 0 ? fbo_stocks / avg_daily_ordered : 0;

    // Доходность
    const revenue_per_unit = ordered_units > 0 ? revenue / ordered_units : 0;
    const profit = revenue - cost_price_total; // упрощённо, без комиссий Ozon
    const profit_unit = bought_in_ozon_orders > 0 ? profit / bought_in_ozon_orders : 0;
    const ros_percent = revenue > 0 ? (profit / revenue) * 100 : 0;
    const margin_percent = revenue_per_unit > 0
      ? ((revenue_per_unit - cost_price_unit) / revenue_per_unit) * 100
      : 0;

    // Ставки
    const redemption_rate = ordered_units > 0 ? (bought_in_ozon_orders / ordered_units) * 100 : 0;
    const cancellation_rate = ordered_units > 0 ? (cancellations / ordered_units) * 100 : 0;
    const return_rate = ordered_units > 0 ? (returns / ordered_units) * 100 : 0;

    // Название товара
    const product_name = rr.find((r) => r.product_name)?.product_name;

    // Timeseries
    const daily = [...rr]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        ordered_units: n(r.ordered_units),
        revenue: n(r.revenue),
        bought_in_ozon_orders: n(r.bought_in_ozon_orders),
        session_view: n(r.session_view),
        cancellations: n(r.cancellations),
        returns: n(r.returns),
      }));

    return {
      offer_id,
      product_name,

      ordered_units,
      revenue,
      bought_in_ozon_orders,
      cancellations,
      returns,
      redemption_rate,
      cancellation_rate,
      return_rate,

      session_view,
      session_view_pdp,
      hits_view,
      conv_tocart_pdp,
      conv_topurchase_pdp,

      fbo_stocks,
      fbs_stocks,
      turnover_days,
      fbo_days,

      cost_price_unit,
      cost_price_total,
      profit,
      profit_unit,
      margin_percent,
      ros_percent,

      days_count,
      revenue_per_unit,
      daily,
    };
  });
}

// ============================================================
// ИТОГОВЫЕ КАРТОЧКИ (все товары)
// ============================================================

export interface TotalSummary {
  ordered_units: number;
  revenue: number;
  bought_in_ozon_orders: number;
  cancellations: number;
  returns: number;
  session_view: number;
  profit: number;
  // Расчётные
  redemption_rate: number;       // % выкупа
  cancellation_rate: number;     // % отмены
  avg_turnover_days: number;     // средняя оборачиваемость
  products_count: number;
}

export function computeTotals(metrics: ProductMetrics[]): TotalSummary {
  const sum = (key: keyof ProductMetrics) =>
    metrics.reduce((s, m) => s + ((m[key] as number) || 0), 0);

  const ordered_units = sum("ordered_units");
  const bought_in_ozon_orders = sum("bought_in_ozon_orders");
  const cancellations = sum("cancellations");

  const turnovers = metrics.filter((m) => m.turnover_days > 0);
  const avg_turnover_days = turnovers.length
    ? turnovers.reduce((s, m) => s + m.turnover_days, 0) / turnovers.length
    : 0;

  return {
    ordered_units,
    revenue: sum("revenue"),
    bought_in_ozon_orders,
    cancellations,
    returns: sum("returns"),
    session_view: sum("session_view"),
    profit: sum("profit"),
    redemption_rate: ordered_units > 0 ? (bought_in_ozon_orders / ordered_units) * 100 : 0,
    cancellation_rate: ordered_units > 0 ? (cancellations / ordered_units) * 100 : 0,
    avg_turnover_days,
    products_count: metrics.length,
  };
}

// ============================================================
// TIMESERIES для графика
// ============================================================

export interface DailyPoint {
  date: string;
  ordered_units: number;
  revenue: number;
  bought_in_ozon_orders: number;
  session_view: number;
  cancellations: number;
  returns: number;
}

export function buildDailyTimeseries(metrics: ProductMetrics[]): DailyPoint[] {
  const dayMap = new Map<string, DailyPoint>();

  for (const m of metrics) {
    for (const d of m.daily || []) {
      const ex = dayMap.get(d.date) || {
        date: d.date,
        ordered_units: 0,
        revenue: 0,
        bought_in_ozon_orders: 0,
        session_view: 0,
        cancellations: 0,
        returns: 0,
      };
      ex.ordered_units += d.ordered_units;
      ex.revenue += d.revenue;
      ex.bought_in_ozon_orders += d.bought_in_ozon_orders;
      ex.session_view += d.session_view;
      ex.cancellations += d.cancellations;
      ex.returns += d.returns;
      dayMap.set(d.date, ex);
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
