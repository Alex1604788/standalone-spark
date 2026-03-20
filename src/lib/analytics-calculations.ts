/**
 * Библиотека расчётов аналитики Ozon
 * Формулы взяты из Kultura Analitiki (KAN) — спарсенные + задокументированные
 */

// ============================================================
// ТИПЫ
// ============================================================

export interface OzonDailyRow {
  offer_id: string;
  date: string;
  // Воронка
  session_view: number | null;
  percent_session_to_pdp: number | null;
  percent_pdp_to_cart: number | null;
  percent_cart_to_order: number | null;
  percent_order_to_buy: number | null;
  percent_pdp_to_order: number | null;
  // Заказы
  ordered_cnt: number | null;
  ordered_amount: number | null;
  bought_cnt: number | null;
  bought_amount: number | null;
  returned_cnt: number | null;
  cancelled_cnt: number | null;
  // Реклама
  adv_views: number | null;
  adv_clicks: number | null;
  adv_carts: number | null;
  adv_orders: number | null;
  adv_revenue: number | null;
  adv_expenses: number | null;
  adv_cpc: number | null;
  adv_cpm: number | null;
  adv_cpcart: number | null;
  adv_cpo: number | null;
  adv_cpo_general: number | null;
  percent_ctr: number | null;
  percent_drr: number | null;
  percent_adv_drr: number | null;
  // Цены
  price_seller: number | null;
  price_ozon: number | null;
  price_index: number | null;
  content_rating: number | null;
  // Финансы (из начислений, если есть)
  bought_commission: number | null;
  bought_expense: number | null;
  returned_amount: number | null;
  returned_commission: number | null;
  returned_expense: number | null;
  acquiring: number | null;
  marketplace_expenses: number | null;
  // Обогащение из других таблиц
  fbo_stocks?: number | null;
  fbs_stocks?: number | null;
  cost_price?: number | null;
}

export interface ProductMetrics {
  offer_id: string;
  product_name?: string;
  category?: string;
  sku?: string;

  // Продажи
  ordered_cnt: number;
  ordered_amount: number;
  bought_cnt: number;
  bought_amount: number;
  returned_cnt: number;
  cancelled_cnt: number;
  percent_cancellations_and_returns: number;

  // Реклама
  adv_views: number;
  adv_clicks: number;
  adv_expenses: number;
  adv_revenue: number;
  adv_carts: number;
  adv_orders: number;
  percent_ctr: number;        // adv_clicks / adv_views * 100
  percent_drr: number;        // adv_expenses / ordered_amount * 100
  percent_adv_drr: number;    // adv_expenses / adv_revenue * 100
  adv_cpc: number;            // adv_expenses / adv_clicks
  adv_cpo: number;            // adv_expenses / adv_orders (рекламные заказы)
  adv_cpo_general: number;    // adv_expenses / ordered_cnt (общий)

  // Воронка (среднее за период)
  session_view: number;
  percent_session_to_pdp: number;
  percent_pdp_to_cart: number;
  percent_cart_to_order: number;
  percent_order_to_buy: number;

  // Остатки (последний день)
  fbo_stocks: number;
  fbs_stocks: number;
  turnover_days: number;      // (fbo + fbs) / avg_week_ordered * 7
  available_in_days: number;  // fbo / avg_week_ordered * 7

  // Доходность
  profit: number;             // bought_amount - комиссии - расходы - себестоимость
  profit_unit: number;        // profit / bought_cnt
  margin_percent: number;     // (price_seller - cost_price) / cost_price * 100
  roi_percent: number;        // profit / (cost_price_total + marketplace_expenses) * 100
  ros_percent: number;        // profit / bought_amount * 100

  // Вспомогательные
  cost_price_total: number;
  price_seller: number;
  price_ozon: number;
  price_index: number;
  content_rating: number;
  days_count: number;

  // Для графиков (timeseries по дням)
  daily?: Array<{
    date: string;
    ordered_cnt: number;
    ordered_amount: number;
    bought_amount: number;
    adv_expenses: number;
    adv_revenue: number;
  }>;
}

// ============================================================
// АГРЕГАЦИЯ
// ============================================================

function n(v: number | null | undefined): number {
  return v ?? 0;
}

export function aggregateToProductMetrics(
  rows: OzonDailyRow[],
  productsInfo?: Map<string, { name: string; category?: string; sku?: string }>
): ProductMetrics[] {
  // Группируем по offer_id
  const grouped = new Map<string, OzonDailyRow[]>();
  for (const row of rows) {
    if (!grouped.has(row.offer_id)) grouped.set(row.offer_id, []);
    grouped.get(row.offer_id)!.push(row);
  }

  return Array.from(grouped.entries()).map(([offer_id, rr]) => {
    // Суммируем накапливаемые метрики
    const ordered_cnt = rr.reduce((s, r) => s + n(r.ordered_cnt), 0);
    const ordered_amount = rr.reduce((s, r) => s + n(r.ordered_amount), 0);
    const bought_cnt = rr.reduce((s, r) => s + n(r.bought_cnt), 0);
    const bought_amount = rr.reduce((s, r) => s + n(r.bought_amount), 0);
    const returned_cnt = rr.reduce((s, r) => s + n(r.returned_cnt), 0);
    const cancelled_cnt = rr.reduce((s, r) => s + n(r.cancelled_cnt), 0);
    const adv_views = rr.reduce((s, r) => s + n(r.adv_views), 0);
    const adv_clicks = rr.reduce((s, r) => s + n(r.adv_clicks), 0);
    const adv_carts = rr.reduce((s, r) => s + n(r.adv_carts), 0);
    const adv_orders = rr.reduce((s, r) => s + n(r.adv_orders), 0);
    const adv_revenue = rr.reduce((s, r) => s + n(r.adv_revenue), 0);
    const adv_expenses = rr.reduce((s, r) => s + n(r.adv_expenses), 0);
    const session_view = rr.reduce((s, r) => s + n(r.session_view), 0);
    const bought_commission = rr.reduce((s, r) => s + n(r.bought_commission), 0);
    const bought_expense = rr.reduce((s, r) => s + n(r.bought_expense), 0);
    const marketplace_expenses = rr.reduce((s, r) => s + n(r.marketplace_expenses), 0);
    const acquiring = rr.reduce((s, r) => s + n(r.acquiring), 0);

    // Последний известный остаток
    const lastRow = [...rr].sort((a, b) => b.date.localeCompare(a.date))[0];
    const fbo_stocks = n(lastRow.fbo_stocks);
    const fbs_stocks = n(lastRow.fbs_stocks);

    // Себестоимость (берём из последней записи с данными)
    const costRow = [...rr].reverse().find((r) => r.cost_price != null);
    const cost_price_unit = n(costRow?.cost_price);
    const cost_price_total = cost_price_unit * bought_cnt;

    // Цены (среднее из непустых)
    const priceRows = rr.filter((r) => r.price_seller != null);
    const price_seller = priceRows.length
      ? priceRows.reduce((s, r) => s + n(r.price_seller), 0) / priceRows.length
      : 0;
    const price_ozon = priceRows.length
      ? priceRows.reduce((s, r) => s + n(r.price_ozon), 0) / priceRows.length
      : 0;
    const price_index_rows = rr.filter((r) => r.price_index != null);
    const price_index = price_index_rows.length
      ? price_index_rows.reduce((s, r) => s + n(r.price_index), 0) / price_index_rows.length
      : 0;
    const content_rows = rr.filter((r) => r.content_rating != null);
    const content_rating = content_rows.length
      ? content_rows.reduce((s, r) => s + n(r.content_rating), 0) / content_rows.length
      : 0;

    // Воронка (среднее по дням где есть данные)
    const funnelRows = rr.filter((r) => r.percent_session_to_pdp != null);
    const avgFunnel = (key: keyof OzonDailyRow) =>
      funnelRows.length
        ? funnelRows.reduce((s, r) => s + n(r[key] as number | null), 0) / funnelRows.length
        : 0;

    // Оборачиваемость
    const days_count = rr.length || 1;
    const avg_week_ordered = (ordered_cnt / days_count) * 7;
    const turnover_days = avg_week_ordered > 0
      ? ((fbo_stocks + fbs_stocks) / avg_week_ordered) * 7
      : 0;
    const available_in_days = avg_week_ordered > 0
      ? (fbo_stocks / avg_week_ordered) * 7
      : 0;

    // Прибыль = выкупы − комиссии − расходы − себестоимость − эквайринг
    const profit =
      bought_amount -
      bought_commission -
      bought_expense -
      marketplace_expenses -
      acquiring -
      cost_price_total;

    const profit_unit = bought_cnt > 0 ? profit / bought_cnt : 0;
    const ros_percent = bought_amount > 0 ? (profit / bought_amount) * 100 : 0;
    const roi_percent =
      cost_price_total + marketplace_expenses > 0
        ? (profit / (cost_price_total + marketplace_expenses)) * 100
        : 0;
    const margin_percent =
      cost_price_unit > 0
        ? ((price_seller - cost_price_unit) / cost_price_unit) * 100
        : 0;

    // Рекламные метрики (считаем сами, данные Ozon могут быть неточными)
    const percent_ctr = adv_views > 0 ? (adv_clicks / adv_views) * 100 : 0;
    const percent_drr = ordered_amount > 0 ? (adv_expenses / ordered_amount) * 100 : 0;
    const percent_adv_drr = adv_revenue > 0 ? (adv_expenses / adv_revenue) * 100 : 0;
    const adv_cpc = adv_clicks > 0 ? adv_expenses / adv_clicks : 0;
    const adv_cpo = adv_orders > 0 ? adv_expenses / adv_orders : 0;
    const adv_cpo_general = ordered_cnt > 0 ? adv_expenses / ordered_cnt : 0;

    const info = productsInfo?.get(offer_id);

    // Timeseries для графиков
    const daily = [...rr]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({
        date: r.date,
        ordered_cnt: n(r.ordered_cnt),
        ordered_amount: n(r.ordered_amount),
        bought_amount: n(r.bought_amount),
        adv_expenses: n(r.adv_expenses),
        adv_revenue: n(r.adv_revenue),
      }));

    return {
      offer_id,
      product_name: info?.name,
      category: info?.category,
      sku: info?.sku,

      ordered_cnt,
      ordered_amount,
      bought_cnt,
      bought_amount,
      returned_cnt,
      cancelled_cnt,
      percent_cancellations_and_returns:
        ordered_cnt > 0 ? ((returned_cnt + cancelled_cnt) / ordered_cnt) * 100 : 0,

      adv_views,
      adv_clicks,
      adv_expenses,
      adv_revenue,
      adv_carts,
      adv_orders,
      percent_ctr,
      percent_drr,
      percent_adv_drr,
      adv_cpc,
      adv_cpo,
      adv_cpo_general,

      session_view,
      percent_session_to_pdp: avgFunnel("percent_session_to_pdp"),
      percent_pdp_to_cart: avgFunnel("percent_pdp_to_cart"),
      percent_cart_to_order: avgFunnel("percent_cart_to_order"),
      percent_order_to_buy: avgFunnel("percent_order_to_buy"),

      fbo_stocks,
      fbs_stocks,
      turnover_days,
      available_in_days,

      profit,
      profit_unit,
      margin_percent,
      roi_percent,
      ros_percent,
      cost_price_total,

      price_seller,
      price_ozon,
      price_index,
      content_rating,
      days_count,
      daily,
    };
  });
}

// ============================================================
// АГРЕГАЦИЯ ПО ВСЕМ ТОВАРАМ (итоговые карточки)
// ============================================================

export interface TotalSummary {
  ordered_cnt: number;
  ordered_amount: number;
  bought_cnt: number;
  bought_amount: number;
  returned_cnt: number;
  cancelled_cnt: number;
  adv_expenses: number;
  adv_revenue: number;
  adv_clicks: number;
  adv_views: number;
  profit: number;
  // Расчётные
  percent_ctr: number;
  percent_drr: number;
  avg_turnover_days: number;
  products_count: number;
}

export function computeTotals(metrics: ProductMetrics[]): TotalSummary {
  const sum = (key: keyof ProductMetrics) =>
    metrics.reduce((s, m) => s + (m[key] as number || 0), 0);

  const ordered_amount = sum("ordered_amount");
  const adv_expenses = sum("adv_expenses");
  const adv_views = sum("adv_views");
  const adv_clicks = sum("adv_clicks");

  const turnovers = metrics.filter((m) => m.turnover_days > 0);
  const avg_turnover_days = turnovers.length
    ? turnovers.reduce((s, m) => s + m.turnover_days, 0) / turnovers.length
    : 0;

  return {
    ordered_cnt: sum("ordered_cnt"),
    ordered_amount,
    bought_cnt: sum("bought_cnt"),
    bought_amount: sum("bought_amount"),
    returned_cnt: sum("returned_cnt"),
    cancelled_cnt: sum("cancelled_cnt"),
    adv_expenses,
    adv_revenue: sum("adv_revenue"),
    adv_clicks,
    adv_views,
    profit: sum("profit"),
    percent_ctr: adv_views > 0 ? (adv_clicks / adv_views) * 100 : 0,
    percent_drr: ordered_amount > 0 ? (adv_expenses / ordered_amount) * 100 : 0,
    avg_turnover_days,
    products_count: metrics.length,
  };
}

// ============================================================
// TIMESERIES — агрегация по дням для графиков
// ============================================================

export interface DailyPoint {
  date: string;
  ordered_cnt: number;
  ordered_amount: number;
  bought_amount: number;
  adv_expenses: number;
  adv_revenue: number;
}

export function buildDailyTimeseries(metrics: ProductMetrics[]): DailyPoint[] {
  const dayMap = new Map<string, DailyPoint>();

  for (const m of metrics) {
    for (const d of m.daily || []) {
      const existing = dayMap.get(d.date) || {
        date: d.date,
        ordered_cnt: 0,
        ordered_amount: 0,
        bought_amount: 0,
        adv_expenses: 0,
        adv_revenue: 0,
      };
      existing.ordered_cnt += d.ordered_cnt;
      existing.ordered_amount += d.ordered_amount;
      existing.bought_amount += d.bought_amount;
      existing.adv_expenses += d.adv_expenses;
      existing.adv_revenue += d.adv_revenue;
      dayMap.set(d.date, existing);
    }
  }

  return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}
