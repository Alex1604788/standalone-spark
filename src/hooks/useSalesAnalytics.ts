import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductSalesData } from "@/lib/sales-calculations";

export interface SalesAnalyticsParams {
  marketplaceId: string;
  startDate: string;
  endDate: string;
}

/**
 * Хук для загрузки данных sales analytics за период
 * Использует SQL функцию get_sales_analytics() и объединяет с бизнес-данными
 */
export const useSalesAnalytics = ({ marketplaceId, startDate, endDate }: SalesAnalyticsParams) => {
  return useQuery({
    queryKey: ["sales-analytics", marketplaceId, startDate, endDate],
    queryFn: async (): Promise<ProductSalesData[]> => {
      // Вызываем SQL функцию get_sales_analytics
      const { data: analyticsData, error: analyticsError } = await supabase.rpc(
        "get_sales_analytics",
        {
          p_marketplace_id: marketplaceId,
          p_start_date: startDate,
          p_end_date: endDate,
        }
      );

      if (analyticsError) {
        console.error("Error fetching analytics:", analyticsError);
        throw analyticsError;
      }

      if (!analyticsData || analyticsData.length === 0) {
        return [];
      }

      // Получаем offer_ids для загрузки дополнительных данных
      const offerIds = analyticsData.map((item: any) => item.offer_id);

      // Загружаем бизнес-данные (закупочная цена, поставщик, категория)
      const { data: businessData, error: businessError } = await supabase
        .from("product_business_data")
        .select("offer_id, purchase_price, category, product_type, product_subtype, supplier_id, suppliers(name)")
        .eq("marketplace_id", marketplaceId)
        .in("offer_id", offerIds);

      if (businessError) {
        console.error("Error fetching business data:", businessError);
      }

      // Загружаем информацию о продуктах (название, артикул)
      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("offer_id, name, external_id")
        .eq("marketplace_id", marketplaceId)
        .in("offer_id", offerIds);

      if (productsError) {
        console.error("Error fetching products:", productsError);
      }

      // Загружаем acquiring costs (эквайринг) за период
      const { data: acquiringData, error: acquiringError } = await supabase
        .from("ozon_accruals")
        .select("offer_id, total_amount")
        .eq("marketplace_id", marketplaceId)
        .gte("accrual_date", startDate)
        .lte("accrual_date", endDate)
        .eq("accrual_type", "Оплата эквайринга");

      if (acquiringError) {
        console.error("Error fetching acquiring data:", acquiringError);
      }

      // Создаем map для быстрого поиска
      const businessDataMap = new Map(
        businessData?.map((item: any) => [
          item.offer_id,
          {
            purchasePrice: item.purchase_price || 0,
            category: item.category || "",
            productType: item.product_type || "",
            productSubtype: item.product_subtype || "",
            supplierName: item.suppliers?.name || "",
          },
        ]) || []
      );

      const productsMap = new Map(
        productsData?.map((item: any) => [
          item.offer_id,
          {
            name: item.name || "",
            article: item.external_id || item.offer_id || "",
          },
        ]) || []
      );

      // Суммируем acquiring по offer_id
      const acquiringMap = new Map<string, number>();
      if (acquiringData) {
        acquiringData.forEach((item: any) => {
          const current = acquiringMap.get(item.offer_id) || 0;
          acquiringMap.set(item.offer_id, current + (item.total_amount || 0));
        });
      }

      // Объединяем данные
      const result: ProductSalesData[] = analyticsData.map((item: any) => {
        const business = businessDataMap.get(item.offer_id) || {
          purchasePrice: 0,
          category: "",
          productType: "",
          productSubtype: "",
          supplierName: "",
        };
        const product = productsMap.get(item.offer_id) || {
          name: `Товар ${item.offer_id}`,
          article: item.offer_id,
        };
        const acquiring = acquiringMap.get(item.offer_id) || 0;

        return {
          offerId: item.offer_id,
          productName: product.name,
          article: product.article,
          category: business.category,
          supplier: business.supplierName,
          salesRevenue: Number(item.total_sales) || 0,
          quantity: Number(item.total_quantity) || 0,
          purchasePrice: Number(business.purchasePrice) || 0,
          promotionCost: Number(item.total_promotion_cost) || 0,
          storageCost: Number(item.total_storage_cost) || 0,
          acquiringCost: Number(acquiring) || 0,
        };
      });

      return result;
    },
    enabled: !!marketplaceId && !!startDate && !!endDate,
    staleTime: 5 * 60 * 1000, // 5 минут
  });
};
