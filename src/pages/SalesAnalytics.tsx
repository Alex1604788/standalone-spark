import { useState } from "react";
import { BarChart3, Package, Truck, FolderOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeriodSelector, type Period } from "@/components/analytics/PeriodSelector";
import { SalesCards } from "@/components/analytics/SalesCards";
import { SalesTable } from "@/components/analytics/SalesTable";
import { calculateMetrics, comparePeriods, type ProductSalesData } from "@/lib/sales-calculations";

const SalesAnalytics = () => {
  // Периоды по умолчанию (последние 30 дней vs предыдущие 30 дней)
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [period1, setPeriod1] = useState<Period>({
    startDate: sixtyDaysAgo.toISOString().split("T")[0],
    endDate: thirtyDaysAgo.toISOString().split("T")[0],
  });

  const [period2, setPeriod2] = useState<Period>({
    startDate: thirtyDaysAgo.toISOString().split("T")[0],
    endDate: today.toISOString().split("T")[0],
  });

  const [isLoading, setIsLoading] = useState(false);

  // TODO: Заменить на реальные данные из Supabase
  // Пока используем моковые данные для демонстрации
  const mockData: ProductSalesData = {
    offerId: "mock",
    productName: "Тестовый товар",
    salesRevenue: 150000,
    salesQuantity: 50,
    purchasePrice: 2000,
    promotionCost: 10000,
    storageCost: 5000,
    acquiringCost: 3000,
  };

  const mockData2: ProductSalesData = {
    ...mockData,
    salesRevenue: 180000,
    salesQuantity: 60,
  };

  const comparison = comparePeriods(mockData, mockData2);

  // TODO: Заменить на реальные данные из БД
  // Моковые данные для таблицы (несколько товаров)
  const mockTableData = [
    {
      offerId: "M30/3",
      productName: "Розетка разборная 3 гнезда",
      category: "Электрика",
      supplierName: "ООО Электросвет",
      period1: comparison.period1,
      period2: comparison.period2,
      total: comparison.total,
      changes: comparison.changes,
    },
    {
      offerId: "K12/5",
      productName: "Кабель удлинитель 5м",
      category: "Электрика",
      supplierName: "ООО Кабельторг",
      period1: calculateMetrics({
        offerId: "K12/5",
        productName: "Кабель удлинитель 5м",
        salesRevenue: 85000,
        salesQuantity: 30,
        purchasePrice: 1800,
        promotionCost: 5000,
        storageCost: 2000,
        acquiringCost: 1500,
      }),
      period2: calculateMetrics({
        offerId: "K12/5",
        productName: "Кабель удлинитель 5м",
        salesRevenue: 95000,
        salesQuantity: 35,
        purchasePrice: 1800,
        promotionCost: 6000,
        storageCost: 2200,
        acquiringCost: 1800,
      }),
      total: calculateMetrics({
        offerId: "K12/5",
        productName: "Кабель удлинитель 5м",
        salesRevenue: 180000,
        salesQuantity: 65,
        purchasePrice: 1800,
        promotionCost: 11000,
        storageCost: 4200,
        acquiringCost: 3300,
      }),
      changes: {
        salesRevenueChange: 11.76,
        grossProfitChange: 12.5,
        netMarginChange: 8.3,
        marginPercentChange: 0.8,
      },
    },
  ];

  const handleApply = () => {
    setIsLoading(true);
    // TODO: Загрузить данные из Supabase
    // - Запросить ozon_accruals за период1 и период2
    // - Запросить storage_costs
    // - Запросить promotion_costs
    // - Объединить с product_business_data для получения закупочных цен
    // - Рассчитать метрики
    console.log("Применение фильтра:", { period1, period2 });
    setTimeout(() => setIsLoading(false), 500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center gap-3">
            <BarChart3 className="w-10 h-10 text-primary" />
            Аналитика Продаж
          </h1>
          <p className="text-muted-foreground">
            Анализ продаж, маржинальности и прибыльности товаров
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Обзор
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Товары
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Поставщики
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Категории
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Выбор периодов */}
            <PeriodSelector
              period1={period1}
              period2={period2}
              onPeriod1Change={setPeriod1}
              onPeriod2Change={setPeriod2}
              onApply={handleApply}
            />

            {/* Сводные карточки */}
            {!isLoading && (
              <div className="animate-fade-in-up">
                <SalesCards
                  period1={comparison.period1}
                  period2={comparison.period2}
                  total={comparison.total}
                  changes={comparison.changes}
                />
              </div>
            )}

            {/* Таблица детализации по товарам */}
            {!isLoading && (
              <div className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
                <SalesTable data={mockTableData} isLoading={isLoading} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Раздел в разработке</p>
              <p className="text-sm mt-2">
                Здесь будет детальная аналитика по товарам: продажи по товарам, маржинальность,
                прибыльность, топ товары и многое другое
              </p>
            </div>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <Truck className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Раздел в разработке</p>
              <p className="text-sm mt-2">
                Здесь будет аналитика по поставщикам: продажи по поставщикам, маржинальность,
                эффективность сотрудничества и многое другое
              </p>
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Раздел в разработке</p>
              <p className="text-sm mt-2">
                Здесь будет аналитика по категориям: продажи по категориям, маржинальность,
                популярные категории и многое другое
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SalesAnalytics;
