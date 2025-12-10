import { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Download, ChevronRight, ChevronDown, List, Layers } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatMoney,
  formatPercent,
  formatQuantity,
  formatChange,
  type CalculatedMetrics,
} from "@/lib/sales-calculations";

interface ProductRow {
  offerId: string;
  productName: string;
  category?: string;
  supplierName?: string;
  productType?: string;
  productSubtype?: string;
  period1: CalculatedMetrics;
  period2: CalculatedMetrics;
  total: CalculatedMetrics;
  changes: {
    salesRevenueChange: number;
    grossProfitChange: number;
    netMarginChange: number;
    marginPercentChange: number;
  };
}

interface SalesTableProps {
  data: ProductRow[];
  isLoading?: boolean;
}

type SortField =
  | "productName"
  | "category"
  | "salesRevenue"
  | "grossProfit"
  | "netMargin"
  | "marginPercent";

type SortDirection = "asc" | "desc";

export const SalesTable = ({ data, isLoading }: SalesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("salesRevenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [viewMode, setViewMode] = useState<"flat" | "hierarchical">("flat");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Фильтрация
  const filteredData = data.filter((row) => {
    const query = searchQuery.toLowerCase();
    return (
      row.productName.toLowerCase().includes(query) ||
      row.offerId.toLowerCase().includes(query) ||
      row.category?.toLowerCase().includes(query) ||
      row.supplierName?.toLowerCase().includes(query)
    );
  });

  // Сортировка
  const sortedData = [...filteredData].sort((a, b) => {
    let aValue: any;
    let bValue: any;

    switch (sortField) {
      case "productName":
        aValue = a.productName;
        bValue = b.productName;
        break;
      case "category":
        aValue = a.category || "";
        bValue = b.category || "";
        break;
      case "salesRevenue":
        aValue = a.total.salesRevenue;
        bValue = b.total.salesRevenue;
        break;
      case "grossProfit":
        aValue = a.total.grossProfit;
        bValue = b.total.grossProfit;
        break;
      case "netMargin":
        aValue = a.total.netMargin;
        bValue = b.total.netMargin;
        break;
      case "marginPercent":
        aValue = a.total.marginPercent;
        bValue = b.total.marginPercent;
        break;
      default:
        return 0;
    }

    if (typeof aValue === "string") {
      return sortDirection === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    } else {
      return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
    }
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  // Функция для агрегации метрик группы
  const aggregateMetrics = (rows: ProductRow[]): CalculatedMetrics => {
    return rows.reduce(
      (acc, row) => ({
        salesRevenue: acc.salesRevenue + row.total.salesRevenue,
        salesQuantity: acc.salesQuantity + row.total.salesQuantity,
        cogs: acc.cogs + row.total.cogs,
        grossProfit: acc.grossProfit + row.total.grossProfit,
        markup: 0, // Будет пересчитан
        promotionCost: acc.promotionCost + row.total.promotionCost,
        storageCost: acc.storageCost + row.total.storageCost,
        acquiringCost: acc.acquiringCost + row.total.acquiringCost,
        netMargin: acc.netMargin + row.total.netMargin,
        marginPercent: 0, // Будет пересчитан
      }),
      {
        salesRevenue: 0,
        salesQuantity: 0,
        cogs: 0,
        grossProfit: 0,
        markup: 0,
        promotionCost: 0,
        storageCost: 0,
        acquiringCost: 0,
        netMargin: 0,
        marginPercent: 0,
      }
    );
  };

  // Иерархическая группировка данных
  const hierarchicalData = useMemo(() => {
    if (viewMode === "flat") return null;

    const groups = new Map<string, Map<string, Map<string, ProductRow[]>>>();

    sortedData.forEach((row) => {
      const supplier = row.supplierName || "Без поставщика";
      const type = row.productType || "Без вида";
      const subtype = row.productSubtype || "Без подвида";

      if (!groups.has(supplier)) {
        groups.set(supplier, new Map());
      }
      const supplierGroup = groups.get(supplier)!;

      if (!supplierGroup.has(type)) {
        supplierGroup.set(type, new Map());
      }
      const typeGroup = supplierGroup.get(type)!;

      if (!typeGroup.has(subtype)) {
        typeGroup.set(subtype, []);
      }
      typeGroup.get(subtype)!.push(row);
    });

    return groups;
  }, [sortedData, viewMode]);

  const toggleGroup = (groupKey: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  // Функции рендеринга иерархических строк
  const renderGroupRow = (
    level: number,
    label: string,
    groupKey: string,
    metrics: CalculatedMetrics,
    hasChildren: boolean = false
  ) => {
    const isExpanded = expandedGroups.has(groupKey);
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
    const indent = level * 20;

    return (
      <TableRow
        key={groupKey}
        className="bg-muted/30 hover:bg-muted/50 font-semibold cursor-pointer"
        onClick={() => hasChildren && toggleGroup(groupKey)}
      >
        <TableCell style={{ paddingLeft: `${indent + 16}px` }}>
          <div className="flex items-center">
            {hasChildren && <ChevronIcon className="w-4 h-4 mr-2" />}
            <span>{label}</span>
          </div>
        </TableCell>
        <TableCell></TableCell>
        <TableCell className="text-right font-semibold">
          {formatMoney(metrics.salesRevenue)}
        </TableCell>
        <TableCell className="text-right">{formatQuantity(metrics.salesQuantity)}</TableCell>
        <TableCell className="text-right font-semibold">
          {formatMoney(metrics.grossProfit)}
        </TableCell>
        <TableCell className="text-right">
          {metrics.salesRevenue > 0
            ? formatPercent((metrics.grossProfit / metrics.salesRevenue) * 100)
            : "0%"}
        </TableCell>
        <TableCell className="text-right font-semibold">
          {formatMoney(metrics.netMargin)}
        </TableCell>
        <TableCell className="text-right font-semibold">
          <span className={metrics.marginPercent >= 0 ? "text-green-600" : "text-red-600"}>
            {metrics.salesRevenue > 0
              ? formatPercent((metrics.netMargin / metrics.salesRevenue) * 100)
              : "0%"}
          </span>
        </TableCell>
        <TableCell></TableCell>
      </TableRow>
    );
  };

  const renderProductRow = (row: ProductRow, level: number) => {
    const indent = level * 20;
    return (
      <TableRow key={row.offerId} className="hover:bg-muted/50">
        <TableCell style={{ paddingLeft: `${indent + 16}px` }}>
          <div>
            <p className="font-medium">{row.productName}</p>
            <p className="text-xs text-muted-foreground">{row.offerId}</p>
          </div>
        </TableCell>
        <TableCell>
          {row.category && <Badge variant="secondary">{row.category}</Badge>}
        </TableCell>
        <TableCell className="text-right font-medium">
          {formatMoney(row.total.salesRevenue)}
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          {formatQuantity(row.total.salesQuantity)}
        </TableCell>
        <TableCell className="text-right font-medium">
          {formatMoney(row.total.grossProfit)}
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          {formatPercent(row.total.markup)}
        </TableCell>
        <TableCell className="text-right font-semibold">
          {formatMoney(row.total.netMargin)}
        </TableCell>
        <TableCell className="text-right font-semibold">
          <span className={row.total.marginPercent >= 0 ? "text-green-600" : "text-red-600"}>
            {formatPercent(row.total.marginPercent)}
          </span>
        </TableCell>
        <TableCell className="text-center">{renderChangeCell(row.changes.salesRevenueChange)}</TableCell>
      </TableRow>
    );
  };

  const renderHierarchicalRows = () => {
    if (!hierarchicalData) return null;

    const rows: JSX.Element[] = [];

    hierarchicalData.forEach((typeGroups, supplier) => {
      const supplierKey = `supplier-${supplier}`;
      const isSupplierExpanded = expandedGroups.has(supplierKey);

      // Собираем все товары для подсчета метрик поставщика
      const supplierProducts: ProductRow[] = [];
      typeGroups.forEach((subtypeGroups) => {
        subtypeGroups.forEach((products) => {
          supplierProducts.push(...products);
        });
      });

      const supplierMetrics = aggregateMetrics(supplierProducts);
      rows.push(renderGroupRow(0, `📦 ${supplier}`, supplierKey, supplierMetrics, true));

      if (isSupplierExpanded) {
        typeGroups.forEach((subtypeGroups, type) => {
          const typeKey = `${supplierKey}-type-${type}`;
          const isTypeExpanded = expandedGroups.has(typeKey);

          // Собираем все товары для подсчета метрик вида
          const typeProducts: ProductRow[] = [];
          subtypeGroups.forEach((products) => {
            typeProducts.push(...products);
          });

          const typeMetrics = aggregateMetrics(typeProducts);
          rows.push(renderGroupRow(1, `🏷️ ${type}`, typeKey, typeMetrics, true));

          if (isTypeExpanded) {
            subtypeGroups.forEach((products, subtype) => {
              const subtypeKey = `${typeKey}-subtype-${subtype}`;
              const isSubtypeExpanded = expandedGroups.has(subtypeKey);

              const subtypeMetrics = aggregateMetrics(products);
              rows.push(renderGroupRow(2, `📎 ${subtype}`, subtypeKey, subtypeMetrics, true));

              if (isSubtypeExpanded) {
                products.forEach((product) => {
                  rows.push(renderProductRow(product, 3));
                });
              }
            });
          }
        });
      }
    });

    return rows;
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="w-4 h-4 ml-1" />
    );
  };

  const renderChangeCell = (value: number) => {
    const { text, color } = formatChange(value);
    const colorClass =
      color === "green"
        ? "text-green-600 bg-green-50"
        : color === "red"
        ? "text-red-600 bg-red-50"
        : "text-gray-600 bg-gray-50";

    return (
      <span className={`text-xs font-medium px-2 py-1 rounded ${colorClass}`}>
        {text}
      </span>
    );
  };

  const handleExportExcel = () => {
    // TODO: Реализовать экспорт в Excel
    console.log("Export to Excel");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-muted-foreground">
            Загрузка данных...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Детализация по товарам</CardTitle>
            <CardDescription>
              Полная таблица продаж и маржинальности по каждому товару
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === "flat" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("flat")}
            >
              <List className="w-4 h-4 mr-2" />
              Плоский вид
            </Button>
            <Button
              variant={viewMode === "hierarchical" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("hierarchical")}
            >
              <Layers className="w-4 h-4 mr-2" />
              Иерархия
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <Download className="w-4 h-4 mr-2" />
              Экспорт
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Поиск */}
        <div className="mb-4">
          <Input
            placeholder="Поиск по названию, артикулу, категории, поставщику..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Счетчик */}
        <div className="mb-4 text-sm text-muted-foreground">
          Найдено товаров: <strong>{sortedData.length}</strong> из{" "}
          <strong>{data.length}</strong>
        </div>

        {/* Таблица */}
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("productName")}
                      className="font-semibold"
                    >
                      Товар
                      <SortIcon field="productName" />
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("category")}
                      className="font-semibold"
                    >
                      Категория
                      <SortIcon field="category" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("salesRevenue")}
                      className="font-semibold"
                    >
                      Продажи (руб)
                      <SortIcon field="salesRevenue" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Продажи (шт)</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("grossProfit")}
                      className="font-semibold"
                    >
                      Валовка
                      <SortIcon field="grossProfit" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">Наценка %</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("netMargin")}
                      className="font-semibold"
                    >
                      Маржа (руб)
                      <SortIcon field="netMargin" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort("marginPercent")}
                      className="font-semibold"
                    >
                      Маржа %
                      <SortIcon field="marginPercent" />
                    </Button>
                  </TableHead>
                  <TableHead className="text-center">Динамика</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? "Ничего не найдено" : "Нет данных"}
                    </TableCell>
                  </TableRow>
                ) : viewMode === "hierarchical" ? (
                  renderHierarchicalRows()
                ) : (
                  sortedData.map((row) => (
                    <TableRow key={row.offerId} className="hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.productName}</p>
                          <p className="text-xs text-muted-foreground">{row.offerId}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.category && (
                          <Badge variant="secondary">{row.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(row.total.salesRevenue)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatQuantity(row.total.salesQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(row.total.grossProfit)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatPercent(row.total.markup)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMoney(row.total.netMargin)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        <span
                          className={
                            row.total.marginPercent >= 0
                              ? "text-green-600"
                              : "text-red-600"
                          }
                        >
                          {formatPercent(row.total.marginPercent)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {renderChangeCell(row.changes.salesRevenueChange)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Легенда */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
          <p className="font-semibold mb-2">Показатели:</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <strong>Валовка</strong> = Продажи - Себестоимость
            </div>
            <div>
              <strong>Наценка %</strong> = Валовка / Продажи × 100
            </div>
            <div>
              <strong>Маржа</strong> = Валовка - Затраты
            </div>
            <div>
              <strong>Маржа %</strong> = Маржа / Продажи × 100
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
