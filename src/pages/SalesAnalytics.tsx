import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { PeriodSelector, type Period } from "@/components/analytics/PeriodSelector";
import { SalesCards } from "@/components/analytics/SalesCards";
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
            Sales Analytics
          </h1>
          <p className="text-muted-foreground">
            Анализ продаж, маржинальности и прибыльности товаров
          </p>
        </div>

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

        {/* TODO: Таблица детализации по товарам */}
        {/* <SalesTable /> */}

        {/* Заглушка для будущей таблицы */}
        <div className="mt-8 p-8 border-2 border-dashed border-muted rounded-lg text-center text-muted-foreground">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-semibold mb-2">Таблица детализации по товарам</p>
          <p className="text-sm">
            Здесь будет таблица с детализацией продаж, маржинальности и прибыльности по каждому товару
          </p>
          <p className="text-xs mt-2 text-muted-foreground/70">
            Компонент в разработке
          </p>
        </div>
      </div>
    </div>
  );
};

export default SalesAnalytics;
