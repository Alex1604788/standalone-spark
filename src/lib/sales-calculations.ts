/**
 * Sales Calculations Library
 * Формулы расчетов маржинальности и юнит-экономики на основе Excel макросов
 */

// ============================================
// ТИПЫ ДАННЫХ
// ============================================

export interface ProductSalesData {
  offerId: string;
  productName: string;
  article?: string;               // Артикул (external_id)
  category?: string;
  supplier?: string;              // Название поставщика

  // Данные за период
  salesRevenue: number;           // Продажи (руб)
  quantity: number;               // Продажи (шт)
  purchasePrice: number;          // Закупочная цена
  promotionCost: number;          // Затраты на продвижение
  storageCost: number;            // Стоимость размещения
  acquiringCost: number;          // Эквайринг
}

export interface CalculatedMetrics {
  // Продажи
  salesRevenue: number;           // Продажи (руб)
  quantity: number;               // Продажи (шт)

  // Валовая прибыль
  grossProfit: number;            // Валовка (руб)
  markup: number;                 // Наценка %

  // Затраты
  promotionCost: number;          // Продвижение (руб)
  storageCost: number;            // Размещение (руб)
  acquiringCost: number;          // Эквайринг (руб)
  totalCosts: number;             // Всего затрат (руб)

  // Итоговая маржа
  netMargin: number;              // Маржа (руб)
  marginPercent: number;          // Маржинальность %

  // Себестоимость
  cogs: number;                   // Cost of Goods Sold (Себестоимость проданных товаров)
}

export interface PeriodComparison {
  period1: CalculatedMetrics;
  period2: CalculatedMetrics;
  total: CalculatedMetrics;

  // Динамика (период 2 vs период 1)
  changes: {
    salesRevenueChange: number;      // Изменение продаж %
    grossProfitChange: number;       // Изменение валовки %
    netMarginChange: number;         // Изменение маржи %
    marginPercentChange: number;     // Изменение маржинальности (п.п.)
  };
}

// ============================================
// ФОРМУЛЫ РАСЧЕТОВ
// ============================================

/**
 * Расчет себестоимости проданных товаров (COGS)
 * COGS = Закупочная цена × Количество проданных
 */
export function calculateCOGS(purchasePrice: number, quantity: number): number {
  return purchasePrice * quantity;
}

/**
 * Расчет валовой прибыли (Gross Profit / Валовка)
 * Валовка = Продажи - Себестоимость
 */
export function calculateGrossProfit(salesRevenue: number, cogs: number): number {
  return salesRevenue - cogs;
}

/**
 * Расчет наценки (Markup %)
 * Наценка % = (Валовка / Продажи) × 100
 */
export function calculateMarkup(grossProfit: number, salesRevenue: number): number {
  if (salesRevenue === 0) return 0;
  return (grossProfit / salesRevenue) * 100;
}

/**
 * Расчет общих затрат
 * Затраты = Продвижение + Размещение + Эквайринг
 */
export function calculateTotalCosts(
  promotionCost: number,
  storageCost: number,
  acquiringCost: number
): number {
  return promotionCost + storageCost + acquiringCost;
}

/**
 * Расчет итоговой маржи (Net Margin / Чистая прибыль)
 * Маржа = Валовка - Продвижение - Размещение - Эквайринг
 */
export function calculateNetMargin(
  grossProfit: number,
  promotionCost: number,
  storageCost: number,
  acquiringCost: number
): number {
  return grossProfit - promotionCost - storageCost - acquiringCost;
}

/**
 * Расчет маржинальности (Margin %)
 * Маржинальность % = (Маржа / Продажи) × 100
 */
export function calculateMarginPercent(netMargin: number, salesRevenue: number): number {
  if (salesRevenue === 0) return 0;
  return (netMargin / salesRevenue) * 100;
}

// ============================================
// КОМПЛЕКСНЫЕ РАСЧЕТЫ
// ============================================

/**
 * Расчет всех метрик для товара за период
 */
export function calculateMetrics(data: ProductSalesData): CalculatedMetrics {
  // Себестоимость
  const cogs = calculateCOGS(data.purchasePrice, data.quantity);

  // Валовая прибыль
  const grossProfit = calculateGrossProfit(data.salesRevenue, cogs);
  const markup = calculateMarkup(grossProfit, data.salesRevenue);

  // Затраты
  const totalCosts = calculateTotalCosts(
    data.promotionCost,
    data.storageCost,
    data.acquiringCost
  );

  // Итоговая маржа
  const netMargin = calculateNetMargin(
    grossProfit,
    data.promotionCost,
    data.storageCost,
    data.acquiringCost
  );
  const marginPercent = calculateMarginPercent(netMargin, data.salesRevenue);

  return {
    salesRevenue: data.salesRevenue,
    quantity: data.quantity,
    grossProfit,
    markup,
    promotionCost: data.promotionCost,
    storageCost: data.storageCost,
    acquiringCost: data.acquiringCost,
    totalCosts,
    netMargin,
    marginPercent,
    cogs,
  };
}

/**
 * Сравнение двух периодов
 */
export function comparePeriods(
  period1Data: ProductSalesData,
  period2Data: ProductSalesData
): PeriodComparison {
  const period1 = calculateMetrics(period1Data);
  const period2 = calculateMetrics(period2Data);

  // Суммарные данные за оба периода
  const totalData: ProductSalesData = {
    offerId: period1Data.offerId,
    productName: period1Data.productName,
    category: period1Data.category,
    supplier: period1Data.supplier,
    salesRevenue: period1Data.salesRevenue + period2Data.salesRevenue,
    quantity: period1Data.quantity + period2Data.quantity,
    purchasePrice: period1Data.purchasePrice, // Используем текущую цену
    promotionCost: period1Data.promotionCost + period2Data.promotionCost,
    storageCost: period1Data.storageCost + period2Data.storageCost,
    acquiringCost: period1Data.acquiringCost + period2Data.acquiringCost,
  };
  const total = calculateMetrics(totalData);

  // Динамика изменений (период 2 vs период 1)
  const changes = {
    salesRevenueChange: calculateChangePercent(
      period1.salesRevenue,
      period2.salesRevenue
    ),
    grossProfitChange: calculateChangePercent(
      period1.grossProfit,
      period2.grossProfit
    ),
    netMarginChange: calculateChangePercent(
      period1.netMargin,
      period2.netMargin
    ),
    marginPercentChange: period2.marginPercent - period1.marginPercent, // Изменение в процентных пунктах
  };

  return {
    period1,
    period2,
    total,
    changes,
  };
}

/**
 * Расчет процента изменения
 * % изменения = ((Новое значение - Старое значение) / Старое значение) × 100
 */
export function calculateChangePercent(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue > 0 ? 100 : 0;
  }
  return ((newValue - oldValue) / oldValue) * 100;
}

// ============================================
// АГРЕГАЦИЯ ДАННЫХ
// ============================================

/**
 * Агрегация массива товаров в один суммарный объект
 */
export function aggregateData(products: ProductSalesData[]): ProductSalesData {
  if (products.length === 0) {
    return {
      offerId: "aggregate",
      productName: "Все товары",
      salesRevenue: 0,
      quantity: 0,
      purchasePrice: 0,
      promotionCost: 0,
      storageCost: 0,
      acquiringCost: 0,
    };
  }

  const totals = products.reduce(
    (acc, p) => ({
      offerId: "aggregate",
      productName: "Все товары",
      salesRevenue: acc.salesRevenue + p.salesRevenue,
      quantity: acc.quantity + p.quantity,
      purchasePrice: acc.purchasePrice, // Не суммируем, используем weighted average
      promotionCost: acc.promotionCost + p.promotionCost,
      storageCost: acc.storageCost + p.storageCost,
      acquiringCost: acc.acquiringCost + p.acquiringCost,
    }),
    {
      offerId: "aggregate",
      productName: "Все товары",
      salesRevenue: 0,
      quantity: 0,
      purchasePrice: 0,
      promotionCost: 0,
      storageCost: 0,
      acquiringCost: 0,
    }
  );

  // Рассчитываем средневзвешенную закупочную цену
  const totalQuantity = totals.quantity;
  if (totalQuantity > 0) {
    totals.purchasePrice =
      products.reduce((acc, p) => acc + p.purchasePrice * p.quantity, 0) / totalQuantity;
  }

  return totals;
}

/**
 * Суммирование метрик по множеству товаров
 */
export function aggregateMetrics(metrics: CalculatedMetrics[]): CalculatedMetrics {
  const totals = metrics.reduce(
    (acc, m) => ({
      salesRevenue: acc.salesRevenue + m.salesRevenue,
      quantity: acc.quantity + m.quantity,
      grossProfit: acc.grossProfit + m.grossProfit,
      markup: 0, // Будет пересчитан
      promotionCost: acc.promotionCost + m.promotionCost,
      storageCost: acc.storageCost + m.storageCost,
      acquiringCost: acc.acquiringCost + m.acquiringCost,
      totalCosts: acc.totalCosts + m.totalCosts,
      netMargin: acc.netMargin + m.netMargin,
      marginPercent: 0, // Будет пересчитан
      cogs: acc.cogs + m.cogs,
    }),
    {
      salesRevenue: 0,
      quantity: 0,
      grossProfit: 0,
      markup: 0,
      promotionCost: 0,
      storageCost: 0,
      acquiringCost: 0,
      totalCosts: 0,
      netMargin: 0,
      marginPercent: 0,
      cogs: 0,
    }
  );

  // Пересчитываем процентные показатели
  totals.markup = calculateMarkup(totals.grossProfit, totals.salesRevenue);
  totals.marginPercent = calculateMarginPercent(totals.netMargin, totals.salesRevenue);

  return totals;
}

// ============================================
// ФОРМАТИРОВАНИЕ
// ============================================

/**
 * Форматирование денег (руб)
 */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Форматирование процентов
 */
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Форматирование количества
 */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

/**
 * Форматирование изменения с цветом (+ или -)
 */
export function formatChange(value: number, decimals: number = 1): {
  text: string;
  color: 'green' | 'red' | 'gray';
} {
  const sign = value > 0 ? '+' : '';
  const text = `${sign}${value.toFixed(decimals)}%`;
  const color = value > 0 ? 'green' : value < 0 ? 'red' : 'gray';

  return { text, color };
}
