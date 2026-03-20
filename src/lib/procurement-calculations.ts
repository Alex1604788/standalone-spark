/**
 * Расчётный движок блока «Закупка и распределение»
 * Все формулы по ТЗ «Документ По Блоку Закупка И Распределение»
 */

// ============================================================
// ТИПЫ
// ============================================================

export interface SalesPlanItem {
  offer_id: string;
  plan_qty: number; // план на месяц
}

export interface SellerCategory {
  code: string;
  coverage_coef: number;   // КФ обеспеченности
  distribution_coef: number; // КФ распределения
  is_novelty: boolean;
}

export interface Cluster {
  id: string;
  name: string;
  short_name: string;
  priority: number;
  is_active: boolean;
}

export interface ClusterDistributionShare {
  cluster_id: string;
  cluster_name: string;
  cluster_short: string;
  distribution_share: number; // 0..1
}

export interface ProductBusinessData {
  offer_id: string;
  product_name?: string;
  seller_category_code?: string;
  lead_time_days: number;
  small_box_quantity?: number | null;
  large_box_quantity?: number | null;
  central_stock: number;
}

export interface ClusterStock {
  cluster_id: string;
  fbo_qty: number;
}

export interface InTransitItem {
  cluster_id: string;
  qty: number;
}

// ============================================================
// РЕЗУЛЬТАТЫ РАСЧЁТА
// ============================================================

export interface ClusterResult {
  cluster_id: string;
  cluster_name: string;
  cluster_short: string;
  priority: number;
  // Расчёт
  cluster_norm: number;          // норма = план × доля
  current_stock: number;         // текущий остаток
  in_transit: number;            // товар в пути
  cluster_need_raw: number;      // потребность до кратности
  cluster_need_final: number;    // потребность с учётом кратности
  manual_override?: number;      // ручная корректировка
  qty_to_ship: number;           // итоговое кол-во к отгрузке
}

export interface AllocationResult {
  offer_id: string;
  product_name?: string;
  plan_qty: number;
  seller_category_code?: string;
  // По кластерам
  clusters: ClusterResult[];
  // ЦС
  total_to_distribute: number;
  central_stock_before: number;
  central_stock_after: number;
  central_norm: number;
  supplier_need: number;
  // Флаги
  has_warning: boolean;
  warnings: string[];
}

// ============================================================
// ФОРМУЛЫ (из ТЗ)
// ============================================================

/**
 * Норма остатка на кластере
 * cluster_norm = plan_qty × cluster_distribution_share
 */
export function calcClusterNorm(plan_qty: number, share: number): number {
  return plan_qty * share;
}

/**
 * Потребность на кластер (до кратности)
 * cluster_need = cluster_norm × seller_distribution_coef − stock − in_transit
 * Если < 0 → 0
 */
export function calcClusterNeedRaw(
  cluster_norm: number,
  distribution_coef: number,
  current_stock: number,
  in_transit: number
): number {
  return Math.max(0, cluster_norm * distribution_coef - current_stock - in_transit);
}

/**
 * Кратность упаковки
 * если box_qty пустой → ceil(need)
 * если ratio < 0.5 → 0
 * если ratio >= 0.5 → round(ratio) × box_qty
 */
export function applyPackagingRounding(need: number, box_qty?: number | null): number {
  if (need <= 0) return 0;
  if (!box_qty || box_qty <= 0) return Math.ceil(need);

  const ratio = need / box_qty;
  if (ratio < 0.5) return 0;
  return Math.round(ratio) * box_qty;
}

/**
 * Норма остатка на центральном складе
 * central_norm = plan × coverage_coef + plan × lead_time_days / 30
 */
export function calcCentralNorm(
  plan_qty: number,
  coverage_coef: number,
  lead_time_days: number
): number {
  return plan_qty * coverage_coef + plan_qty * (lead_time_days / 30);
}

/**
 * К заказу поставщику
 * supplier_need = central_norm − stock_after_allocation
 * Если < 0 → 0
 */
export function calcSupplierNeed(central_norm: number, stock_after_allocation: number): number {
  return Math.max(0, central_norm - stock_after_allocation);
}

// ============================================================
// ПОЛНЫЙ РАСЧЁТ ДЛЯ ОДНОГО ТОВАРА
// ============================================================

export interface CalcAllocationInput {
  plan_qty: number;
  seller_category: SellerCategory;
  product_business: ProductBusinessData;
  distributions: ClusterDistributionShare[];
  clusters_meta: Map<string, Cluster>;
  stock_by_cluster: Map<string, number>;
  in_transit_by_cluster: Map<string, number>;
}

export function calcAllocationForProduct(
  offer_id: string,
  product_name: string | undefined,
  input: CalcAllocationInput
): AllocationResult {
  const {
    plan_qty,
    seller_category,
    product_business,
    distributions,
    clusters_meta,
    stock_by_cluster,
    in_transit_by_cluster,
  } = input;

  const warnings: string[] = [];

  if (plan_qty <= 0) {
    warnings.push("План продаж = 0");
  }

  const box_qty = product_business.small_box_quantity || product_business.large_box_quantity;

  // Расчёт по каждому кластеру
  const clusterResults: ClusterResult[] = distributions.map((d) => {
    const meta = clusters_meta.get(d.cluster_id);
    const current_stock = stock_by_cluster.get(d.cluster_id) ?? 0;
    const in_transit = in_transit_by_cluster.get(d.cluster_id) ?? 0;

    const cluster_norm = calcClusterNorm(plan_qty, d.distribution_share);
    const cluster_need_raw = calcClusterNeedRaw(
      cluster_norm,
      seller_category.distribution_coef,
      current_stock,
      in_transit
    );
    const cluster_need_final = applyPackagingRounding(cluster_need_raw, box_qty);

    return {
      cluster_id: d.cluster_id,
      cluster_name: d.cluster_name,
      cluster_short: d.cluster_short,
      priority: meta?.priority ?? 0,
      cluster_norm,
      current_stock,
      in_transit,
      cluster_need_raw,
      cluster_need_final,
      qty_to_ship: cluster_need_final,
    };
  });

  const total_to_distribute = clusterResults.reduce((s, c) => s + c.qty_to_ship, 0);
  const central_stock_before = product_business.central_stock;
  const central_stock_after = central_stock_before - total_to_distribute;

  const central_norm = calcCentralNorm(
    plan_qty,
    seller_category.coverage_coef,
    product_business.lead_time_days
  );

  const supplier_need = calcSupplierNeed(central_norm, Math.max(0, central_stock_after));

  if (central_stock_after < 0) {
    warnings.push(`Дефицит ЦС: нехватает ${Math.abs(Math.round(central_stock_after))} шт`);
  }

  if (supplier_need > 0) {
    warnings.push(`К заказу поставщику: ${Math.round(supplier_need)} шт`);
  }

  // Сортируем кластеры по приоритету
  clusterResults.sort((a, b) => a.priority - b.priority);

  return {
    offer_id,
    product_name,
    plan_qty,
    seller_category_code: seller_category.code,
    clusters: clusterResults,
    total_to_distribute,
    central_stock_before,
    central_stock_after,
    central_norm,
    supplier_need,
    has_warning: warnings.length > 0,
    warnings,
  };
}

// ============================================================
// ПРИМЕНЕНИЕ РУЧНЫХ КОРРЕКТИРОВОК
// ============================================================

export function applyManualOverride(
  result: AllocationResult,
  cluster_id: string,
  override_qty: number
): AllocationResult {
  const updated = result.clusters.map((c) => {
    if (c.cluster_id !== cluster_id) return c;
    return { ...c, manual_override: override_qty, qty_to_ship: override_qty };
  });

  const total_to_distribute = updated.reduce((s, c) => s + c.qty_to_ship, 0);
  const central_stock_after = result.central_stock_before - total_to_distribute;
  const supplier_need = calcSupplierNeed(result.central_norm, Math.max(0, central_stock_after));

  return {
    ...result,
    clusters: updated,
    total_to_distribute,
    central_stock_after,
    supplier_need,
  };
}

// ============================================================
// РАЗВОРОТ КОМПЛЕКТОВ (BOM)
// ============================================================

export interface BomItem {
  parent_offer_id: string;
  component_offer_id: string;
  component_qty: number;
}

/**
 * Разворачивает заказ комплектов в компоненты.
 * Если offer_id есть в BOM как parent — возвращает компоненты.
 * Иначе возвращает сам товар.
 */
export function expandBom(
  items: Array<{ offer_id: string; qty: number }>,
  bom: BomItem[]
): Array<{ offer_id: string; qty: number; from_parent?: string }> {
  const bomMap = new Map<string, BomItem[]>();
  for (const b of bom) {
    if (!bomMap.has(b.parent_offer_id)) bomMap.set(b.parent_offer_id, []);
    bomMap.get(b.parent_offer_id)!.push(b);
  }

  const result: Array<{ offer_id: string; qty: number; from_parent?: string }> = [];
  for (const item of items) {
    const components = bomMap.get(item.offer_id);
    if (components && components.length > 0) {
      for (const c of components) {
        result.push({
          offer_id: c.component_offer_id,
          qty: item.qty * c.component_qty,
          from_parent: item.offer_id,
        });
      }
    } else {
      result.push(item);
    }
  }
  return result;
}
