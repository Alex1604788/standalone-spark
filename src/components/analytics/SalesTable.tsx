import { useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
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
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт в Excel
          </Button>
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
