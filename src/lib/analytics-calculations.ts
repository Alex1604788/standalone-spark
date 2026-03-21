/**
 * Библиотека расчётов аналитики Ozon
 * Использует реальные метрики Ozon API /v1/analytics/data (dimension=sku+day)
 *
 * Формула прибыли (аналог Культуры Аналитики):
 *   profit = revenue
 *          + commission            (отриц. — комиссия Ozon)
 *          + logistics_to_customer (отриц. — логистика к покупателю)
 *          + logistics_return      (отриц. — логистика возвратов/отмен)
 *          + acquiring             (отриц. — эквайринг)
 *          + other_expenses        (отриц. — прочие начисления Ozon)
 *          - adv_expenses          — расходы на рекламу
 *          - cost_price_total      — себестоимость × выкуплено
 *
 * НЕ включаем: хранение (из отчёта размещения), кросс-докинг (не поартикульно), налоги.
 */

// ============================================================
// ТИПЫ — точно соответствуют колонкам БД ozon_analytics_daily
// ============================================================

export interface OzonDailyRow {
  offer_id: string;
  product_name?: string;
  date: string;

  // Заказы / выкупы
  ordered_units: number | null;
  revenue: number | null;
  cancellations: number | null;
  returns: number | null;
  bought_in_ozon_orders: number | null;

  // Трафик
  session_view: number | null;
  session_view_pdp: number | null;
  hits_view: number | null;

  // Конверсия
  conv_tocart_pdp: number | null;
  conv_topurchase_pdp?: number | null;

  // Обогащение из других таблиц
  fbo_stocks?: number | null;
  fbs_stocks?: number | null;
  cost_price?: number | null;

  // Финансовые компоненты из ozon_finance_daily (суммарно за период)
  commission?: number | null;            // Комиссия Ozon (отриц.)
  logistics_to_customer?: number | null; // Логистика к покупателю (отриц.)
  logistics_return?: number | null;      // Логистика возвратов (отриц.)
  acquiring?: number | null;             // Эквайринг (отриц.)
  other_expenses?: number | null;        // Прочие начисления (отриц.)

  // Расходы на рекламу из ozon_performance_daily (суммарно за период)
  adv_expenses?: number | null;
}

export interface ProductMetrics {
  offer_id: string;
  product_name?: string;

  // Продажи
  ordered_units: number;
  revenue: number;
  bought_in_ozon_orders: number;
  cancellations: number;
  returns: number;
  redemption_rate: number;
  cancellation_rate: number;
  return_rate: number;

  // Трафик
  session_view: number;
  session_view_pdp: number;
  hits_view: number;

  // Конверсия
  conv_tocart_pdp: number;
  conv_topurchase_pdp: number;

  // Остатки
  fbo_stocks: number;
  fbs_stocks: number;
  turnover_days: number;
  fbo_days: number;

  // Себестоимость
  cost_price_unit: number;
  cost_price_total: number;

  // Финансовые компоненты (из Finance API)
  commission: number;
  logistics_to_customer: number;
  logistics_return: number;
  acquiring: number;
  other_expenses: number;
  adv_expenses: number;

  // Итоговые метрики доходности
  total_expenses: number;   // Сумма всех расходов (без себест.)
  profit: number;
  profit_unit: number;
  margin_percent: number;   // Наценка: (цена-себест)/себест*100 (как в КА)
  ros_percent: number;      // ROS: profit/revenue*100
  drr_percent: number;      // ДРР: adv/revenue*100

  // Вспомогательные
  days_count: number;
  revenue_per_unit: number;

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
    const ordered_units      = rr.reduce((s, r) => s + n(r.ordered_units), 0);
    const revenue            = rr.reduce((s, r) => s + n(r.revenue), 0);
    const bought_raw         = rr.reduce((s, r) => s + n(r.bought_in_ozon_orders), 0);
    const cancellations      = rr.reduce((s, r) => s + n(r.cancellations), 0);
    const returns            = rr.reduce((s, r) => s + n(r.returns), 0);
    const bought_in_ozon_orders = bought_raw > 0
      ? bought_raw
      : Math.max(0, ordered_units - cancellations - returns);
    const session_view       = rr.reduce((s, r) => s + n(r.session_view), 0);
    const session_view_pdp   = rr.reduce((s, r) => s + n(r.session_view_pdp), 0);
    const hits_view          = rr.reduce((s, r) => s + n(r.hits_view), 0);

    // Усредняем конверсии
    const cartRows = rr.filter((r) => r.conv_tocart_pdp != null);
    const buyRows  = rr.filter((r) => r.conv_topurchase_pdp != null);
    const conv_tocart_pdp     = avg(cartRows.map((r) => n(r.conv_tocart_pdp)));
    const conv_topurchase_pdp = avg(buyRows.map((r)  => n(r.conv_topurchase_pdp)));

    // Последний известный остаток
    const lastRow    = [...rr].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fbo_stocks = n(lastRow.fbo_stocks);
    const fbs_stocks = n(lastRow.fbs_stocks);

    // Себестоимость
    const costRow          = rr.find((r) => r.cost_price != null);
    const cost_price_unit  = n(costRow?.cost_price);
    const cost_price_total = cost_price_unit * bought_in_ozon_orders;

    // ── Финансовые компоненты ─────────────────────────────────
    // Данные за весь период (не посуточные) — берём первую строку где есть
    const finRow             = rr.find((r) => r.commission != null);
    const commission         = n(finRow?.commission);            // отриц.
    const logistics_to_customer = n(finRow?.logistics_to_customer); // отриц.
    const logistics_return   = n(finRow?.logistics_return);     // отриц.
    const acquiring          = n(finRow?.acquiring);            // отриц.
    const other_expenses     = n(finRow?.other_expenses);       // отриц.

    const advRow       = rr.find((r) => r.adv_expenses != null);
    const adv_expenses = n(advRow?.adv_expenses);               // положит.

    // ── Прибыль ───────────────────────────────────────────────
    // commission / logistics / acquiring — уже отрицательные из Ozon API → складываем
    // adv_expenses — положительное число → вычитаем
    const total_expenses =
      commission + logistics_to_customer + logistics_return +
      acquiring + other_expenses - adv_expenses;

    const profit =
      revenue
      + commission
      + logistics_to_customer
      + logistics_return
      + acquiring
      + other_expenses
      - adv_expenses
      - cost_price_total;

    const profit_unit = bought_in_ozon_orders > 0 ? profit / bought_in_ozon_orders : 0;

    // Средняя цена продажи
    const revenue_per_unit = ordered_units > 0 ? revenue / ordered_units : 0;

    // Наценка (markup) — как в Культуре Аналитики
    const margin_percent = cost_price_unit > 0
      ? ((revenue_per_unit - cost_price_unit) / cost_price_unit) * 100
      : 0;

    // ROS и ДРР
    const ros_percent = revenue > 0 ? (profit / revenue) * 100 : 0;
    const drr_percent = revenue > 0 ? (adv_expenses / revenue) * 100 : 0;

    // Оборачиваемость
    const days_count        = rr.length || 1;
    const avg_daily_ordered = ordered_units / days_count;
    const total_stocks      = fbo_stocks + fbs_stocks;
    const turnover_days     = avg_daily_ordered > 0 ? total_stocks / avg_daily_ordered : 0;
    const fbo_days          = avg_daily_ordered > 0 ? fbo_stocks  / avg_daily_ordered : 0;

    // Ставки
    const redemption_rate   = ordered_units > 0 ? (bought_in_ozon_orders / ordered_units) * 100 : 0;
    const cancellation_rate = ordered_units > 0 ? (cancellations / ordered_units) * 100 : 0;
    const return_rate       = ordered_units > 0 ? (returns / ordered_units) * 100 : 0;

    // Название товара
    const product_name = rr.find((r) => r.product_name)?.product_name;

    // Timeseries
    const daily = [...rr]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date:                 r.date,
        ordered_units:        n(r.ordered_units),
        revenue:              n(r.revenue),
        bought_in_ozon_orders: n(r.bought_in_ozon_orders),
        session_view:         n(r.session_view),
        cancellations:        n(r.cancellations),
        returns:              n(r.returns),
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

      commission,
      logistics_to_customer,
      logistics_return,
      acquiring,
      other_expenses,
      adv_expenses,

      total_expenses,
      profit,
      profit_unit,
      margin_percent,
      ros_percent,
      drr_percent,

      days_count,
      revenue_per_unit,
      daily,
    };
  });
}

// ============================================================
// ИТОГОВЫЕ КАРТОЧКИ
// ============================================================

export interface TotalSummary {
  ordered_units: number;
  revenue: number;
  bought_in_ozon_orders: number;
  cancellations: number;
  returns: number;
  session_view: number;
  profit: number;
  adv_expenses: number;
  commission: number;
  // Расчётные
  redemption_rate: number;
  cancellation_rate: number;
  avg_turnover_days: number;
  drr_percent: number;
  ros_percent: number;
  products_count: number;
}

export function computeTotals(metrics: ProductMetrics[]): TotalSummary {
  const sum = (key: keyof ProductMetrics) =>
    metrics.reduce((s, m) => s + ((m[key] as number) || 0), 0);

  const ordered_units       = sum("ordered_units");
  const bought_in_ozon_orders = sum("bought_in_ozon_orders");
  const cancellations       = sum("cancellations");
  const revenue             = sum("revenue");
  const profit              = sum("profit");
  const adv_expenses        = sum("adv_expenses");
  const commission          = sum("commission");

  const turnovers = metrics.filter((m) => m.turnover_days > 0);
  const avg_turnover_days = turnovers.length
    ? turnovers.reduce((s, m) => s + m.turnover_days, 0) / turnovers.length
    : 0;

  return {
    ordered_units,
    revenue,
    bought_in_ozon_orders,
    cancellations,
    returns:          sum("returns"),
    session_view:     sum("session_view"),
    profit,
    adv_expenses,
    commission,
    redemption_rate:  ordered_units > 0 ? (bought_in_ozon_orders / ordered_units) * 100 : 0,
    cancellation_rate: ordered_units > 0 ? (cancellations / ordered_units) * 100 : 0,
    avg_turnover_days,
    drr_percent:      revenue > 0 ? (adv_expenses / revenue) * 100 : 0,
    ros_percent:      revenue > 0 ? (profit / revenue) * 100 : 0,
    products_count:   metrics.length,
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
      ex.ordered_units         += d.ordered_units;
      ex.revenue               += d.revenue;
      ex.bought_in_ozon_orders += d.bought_in_ozon_orders;
      ex.session_view          += d.session_view;
      ex.cancellations         += d.cancellations;
      ex.returns               += d.returns;
      dayMap.set(d.date, ex);
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
