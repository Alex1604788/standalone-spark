import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { PeriodSelector, type Period } from "@/components/analytics/PeriodSelector";
import { SalesCards } from "@/components/analytics/SalesCards";
import { SalesTable } from "@/components/analytics/SalesTable";
import { calculateMetrics, comparePeriods, aggregateData } from "@/lib/sales-calculations";
import { useSalesAnalytics } from "@/hooks/useSalesAnalytics";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

  // Получаем ID первого маркетплейса пользователя
  const { data: marketplace } = useQuery({
    queryKey: ["user-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplaces")
        .select("id")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Загрузка данных для периода 1
  const {
    data: period1Data,
    isLoading: isLoading1,
    refetch: refetch1,
  } = useSalesAnalytics({
    marketplaceId: marketplace?.id || "",
    startDate: period1.startDate,
    endDate: period1.endDate,
  });

  // Загрузка данных для периода 2
  const {
    data: period2Data,
    isLoading: isLoading2,
    refetch: refetch2,
  } = useSalesAnalytics({
    marketplaceId: marketplace?.id || "",
    startDate: period2.startDate,
    endDate: period2.endDate,
  });

  const isLoading = isLoading1 || isLoading2 || !marketplace;

  // Агрегируем данные и вычисляем метрики
  const aggregatedPeriod1 = period1Data ? aggregateData(period1Data) : null;
  const aggregatedPeriod2 = period2Data ? aggregateData(period2Data) : null;

  // Сравнение периодов
  const comparison =
    aggregatedPeriod1 && aggregatedPeriod2
      ? comparePeriods(aggregatedPeriod1, aggregatedPeriod2)
      : null;

  // Подготовка данных для таблицы (по каждому товару)
  const tableData =
    period1Data && period2Data
      ? period1Data.map((p1) => {
          // Находим данные для того же товара в период2
          const p2 = period2Data.find((p) => p.offerId === p1.offerId) || {
            ...p1,
            salesRevenue: 0,
            quantity: 0,
            promotionCost: 0,
            storageCost: 0,
            acquiringCost: 0,
          };

          // Рассчитываем метрики для обоих периодов
          const metrics1 = calculateMetrics(p1);
          const metrics2 = calculateMetrics(p2);

          // Суммарные данные
          const total = calculateMetrics({
            ...p1,
            salesRevenue: p1.salesRevenue + p2.salesRevenue,
            quantity: p1.quantity + p2.quantity,
            promotionCost: p1.promotionCost + p2.promotionCost,
            storageCost: p1.storageCost + p2.storageCost,
            acquiringCost: p1.acquiringCost + p2.acquiringCost,
          });

          // Изменения
          const calculateChange = (v1: number, v2: number) =>
            v1 !== 0 ? ((v2 - v1) / v1) * 100 : v2 !== 0 ? 100 : 0;

          return {
            offerId: p1.offerId,
            productName: p1.productName,
            category: p1.category || "",
            supplier: p1.supplier || "",
            period1: metrics1,
            period2: metrics2,
            total,
            changes: {
              salesRevenueChange: calculateChange(metrics1.salesRevenue, metrics2.salesRevenue),
              grossProfitChange: calculateChange(metrics1.grossProfit, metrics2.grossProfit),
              netMarginChange: calculateChange(metrics1.netMargin, metrics2.netMargin),
              marginPercentChange: metrics2.marginPercent - metrics1.marginPercent,
            },
          };
        })
      : [];

  const handleApply = () => {
    refetch1();
    refetch2();
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
        {!isLoading && comparison && (
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
        {!isLoading && tableData.length > 0 && (
          <div className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
            <SalesTable data={tableData} isLoading={isLoading} />
          </div>
        )}

        {/* Сообщение если нет данных */}
        {!isLoading && tableData.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-lg">Нет данных за выбранные периоды</p>
            <p className="text-sm mt-2">
              Импортируйте данные из OZON через страницу "Импорт данных"
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SalesAnalytics;
