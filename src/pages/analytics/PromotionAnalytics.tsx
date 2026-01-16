/**
 * АНАЛИТИКА РЕКЛАМНЫХ КАМПАНИЙ (OZON PERFORMANCE API)
 *
 * ⚠️ ВАЖНО: Это НЕ Аналитика Акций!
 *
 * Этот файл: Аналитика эффективности рекламных кампаний OZON Performance
 * Маршрут: /app/analytics/promotion
 *
 * Другой файл: PromotionsAnalytics.tsx - это аналитика акций и скидок магазина (заглушка)
 * Маршрут: /app/analytics/promotions
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Megaphone,
  DollarSign,
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Settings,
  ArrowUpDown,
  TrendingUp,
  Eye,
  MousePointerClick,
  ShoppingCart
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ru } from "date-fns/locale";
import { DateRangePicker } from "@/components/ui/date-range-picker";

interface CampaignData {
  campaign_id: string;
  campaign_name: string;
  campaign_type: string | null;
  total_money_spent: number;
  total_views: number;
  total_clicks: number;
  total_add_to_cart: number;
  total_favorites: number;
  total_orders: number;
  total_revenue: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_add_to_cart_conversion: number;
  avg_conversion: number;
  avg_drr: number;
  date_range: { min: string; max: string };
  sku_count: number;
  products: ProductData[];
}

interface ProductData {
  sku: string;
  offer_id: string | null;
  product_name: string | null;
  product_image: string | null;
  total_money_spent: number;
  total_views: number;
  total_clicks: number;
  total_add_to_cart: number;
  total_favorites: number;
  total_orders: number;
  total_revenue: number;
  avg_ctr: number;
  avg_cpc: number;
  avg_add_to_cart_conversion: number;
  avg_conversion: number;
  avg_drr: number;
  date_range: { min: string; max: string };
  days_count: number;
}

const PromotionAnalytics = () => {
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(new Set());
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // Устанавливаем период по умолчанию: последние 90 дней или текущий месяц
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 90),
    end: new Date(),
  });

  // Управление видимостью столбцов
  const [visibleColumns, setVisibleColumns] = useState({
    товаров: true,
    расходы: true,
    показы: true,
    клики: true,
    в_корзину: true,
    избранное: true,
    заказы: true,
    выручка: true,
    ctr: true,
    cpc: true,
    конв_корзина: true,
    конверсия: true,
    дрр: true,
  });

  const toggleColumn = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  // Сортировка кампаний
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc' | null;
  }>({
    key: '',
    direction: null,
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  // Получаем marketplace_id пользователя
  const { data: marketplace } = useQuery({
    queryKey: ["user-marketplace"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log("❌ Нет пользователя");
        return null;
      }

      const { data, error } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("❌ Ошибка получения marketplace:", error);
        throw error;
      }
      
      console.log("✅ Получен marketplace_id:", data?.id);
      return data;
    },
  });

  // Загружаем данные по кампаниям используя SQL-функцию для агрегации
  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ["promotions-campaigns", marketplace?.id, dateRange],
    queryFn: async () => {
      if (!marketplace?.id) {
        console.log("❌ Нет marketplace.id");
        return [];
      }

      console.log("🔍 Запрос агрегированных данных для marketplace:", marketplace.id);
      console.log("📅 Период:", format(dateRange.start, "yyyy-MM-dd"), "-", format(dateRange.end, "yyyy-MM-dd"));

      // Используем SQL-функцию для получения агрегированных данных по кампаниям
      const { data: campaignsAggregated, error } = await supabase
        .rpc("get_campaign_performance_aggregated", {
          p_marketplace_id: marketplace.id,
          p_start_date: format(dateRange.start, "yyyy-MM-dd"),
          p_end_date: format(dateRange.end, "yyyy-MM-dd"),
        });

      if (error) {
        console.error("❌ Ошибка загрузки агрегированных данных:", error);
        throw error;
      }

      console.log("✅ Загружено кампаний:", campaignsAggregated?.length || 0);

      if (!campaignsAggregated || campaignsAggregated.length === 0) {
        console.log("⚠️ Нет данных для marketplace:", marketplace.id, "за период:", format(dateRange.start, "yyyy-MM-dd"), "-", format(dateRange.end, "yyyy-MM-dd"));
        return [];
      }

      console.log("📊 Пример первой кампании:", campaignsAggregated[0]);

      // Преобразуем агрегированные данные из SQL в формат CampaignData
      const campaignMap = new Map<string, CampaignData>();

      for (const row of campaignsAggregated) {
        const campaignId = row.campaign_id || "__NO_CAMPAIGN__";

        campaignMap.set(campaignId, {
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name || "Кампания без названия",
          campaign_type: row.campaign_type,
          total_money_spent: Number(row.total_money_spent || 0),
          total_views: Number(row.total_views || 0),
          total_clicks: Number(row.total_clicks || 0),
          total_add_to_cart: Number(row.total_add_to_cart || 0),
          total_favorites: Number(row.total_favorites || 0),
          total_orders: Number(row.total_orders || 0),
          total_revenue: Number(row.total_revenue || 0),
          avg_ctr: Number(row.avg_ctr || 0),
          avg_cpc: Number(row.avg_cpc || 0),
          avg_add_to_cart_conversion: Number(row.avg_add_to_cart_conversion || 0),
          avg_conversion: Number(row.avg_conversion || 0),
          avg_drr: Number(row.avg_drr || 0),
          date_range: {
            min: row.min_date || format(dateRange.start, "yyyy-MM-dd"),
            max: row.max_date || format(dateRange.end, "yyyy-MM-dd")
          },
          sku_count: Number(row.sku_count || 0),
          products: [], // Будет загружено отдельно при раскрытии кампании
        });
      }

      console.log("✅ Обработано кампаний:", campaignMap.size);
      console.log("💰 Примеры расходов по кампаниям:",
        Array.from(campaignMap.values()).slice(0, 5).map(c => ({
          name: c.campaign_name,
          spent: c.total_money_spent,
          products: c.sku_count
        }))
      );

      // Возвращаем кампании (уже отсортированы по total_money_spent в SQL)
      const campaigns = Array.from(campaignMap.values());

      console.log("✅ Итого кампаний:", campaigns.length);

      return campaigns;
    },
    enabled: !!marketplace?.id,
  });

  const toggleCampaign = async (campaignId: string) => {
    const newExpanded = new Set(expandedCampaigns);
    const isExpanding = !newExpanded.has(campaignId);

    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
    } else {
      newExpanded.add(campaignId);
    }
    setExpandedCampaigns(newExpanded);

    // Загружаем товары при раскрытии кампании
    if (isExpanding && marketplace?.id) {
      const campaign = campaignsData?.find(c => c.campaign_id === campaignId);
      if (campaign && campaign.products.length === 0 && campaign.sku_count > 0) {
        try {
          console.log("🔍 Загрузка товаров для кампании:", campaignId);

          const { data: productsData, error } = await supabase.rpc("get_product_performance_by_campaign", {
            p_marketplace_id: marketplace.id,
            p_campaign_id: campaignId,
            p_start_date: format(dateRange.start, "yyyy-MM-dd"),
            p_end_date: format(dateRange.end, "yyyy-MM-dd"),
          });

          if (error) {
            console.error("❌ Ошибка загрузки товаров:", error);
            return;
          }

          console.log("✅ Загружено товаров:", productsData?.length || 0);

          if (productsData && productsData.length > 0) {
            // Загружаем информацию о продуктах из таблицы products
            const skus = productsData.map((p: any) => p.sku);
            const { data: productInfo } = await supabase
              .from("products")
              .select("sku, name, image_url")
              .eq("marketplace_id", marketplace.id)
              .in("sku", skus);

            const productInfoMap = new Map(productInfo?.map(p => [p.sku, p]) || []);

            // Распределяем расходы пропорционально кликам
            const totalClicks = productsData.reduce((sum: number, p: any) => sum + Number(p.total_clicks || 0), 0);

            campaign.products = productsData.map((p: any) => {
              const info = productInfoMap.get(p.sku);
              const productClicks = Number(p.total_clicks || 0);
              const productMoneySpent = totalClicks > 0
                ? (productClicks / totalClicks) * campaign.total_money_spent
                : 0;

              return {
                sku: p.sku,
                offer_id: p.offer_id,
                product_name: info?.name || null,
                product_image: info?.image_url || null,
                total_money_spent: productMoneySpent,
                total_views: Number(p.total_views || 0),
                total_clicks: Number(p.total_clicks || 0),
                total_add_to_cart: Number(p.total_add_to_cart || 0),
                total_favorites: Number(p.total_favorites || 0),
                total_orders: Number(p.total_orders || 0),
                total_revenue: Number(p.total_revenue || 0),
                avg_ctr: Number(p.avg_ctr || 0),
                avg_cpc: productClicks > 0 ? productMoneySpent / productClicks : 0,
                avg_add_to_cart_conversion: Number(p.avg_add_to_cart_conversion || 0),
                avg_conversion: Number(p.avg_conversion || 0),
                avg_drr: Number(p.total_revenue) > 0 ? (productMoneySpent / Number(p.total_revenue)) * 100 : 0,
                date_range: { min: p.min_date, max: p.max_date },
                days_count: Number(p.days_count || 0),
              };
            });
          }
        } catch (error) {
          console.error("❌ Ошибка при загрузке товаров:", error);
        }
      }
    }
  };

  const toggleProduct = (key: string) => {
    const newExpanded = new Set(expandedProducts);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedProducts(newExpanded);
  };

  let filteredCampaigns = campaignsData?.filter((campaign) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        campaign.campaign_name.toLowerCase().includes(query) ||
        campaign.campaign_type?.toLowerCase().includes(query) ||
        campaign.products.some(
          (p) =>
            p.sku.toLowerCase().includes(query) ||
            p.product_name?.toLowerCase().includes(query) ||
            p.offer_id?.toLowerCase().includes(query)
        )
      );
    }
    return true;
  }) || [];

  // Применяем сортировку
  if (sortConfig.key && sortConfig.direction) {
    filteredCampaigns = [...filteredCampaigns].sort((a, b) => {
      let aValue: number = 0;
      let bValue: number = 0;

      switch (sortConfig.key) {
        case 'товаров':
          aValue = a.sku_count;
          bValue = b.sku_count;
          break;
        case 'расходы':
          aValue = a.total_money_spent;
          bValue = b.total_money_spent;
          break;
        case 'показы':
          aValue = a.total_views;
          bValue = b.total_views;
          break;
        case 'клики':
          aValue = a.total_clicks;
          bValue = b.total_clicks;
          break;
        case 'в_корзину':
          aValue = a.total_add_to_cart;
          bValue = b.total_add_to_cart;
          break;
        case 'избранное':
          aValue = a.total_favorites;
          bValue = b.total_favorites;
          break;
        case 'заказы':
          aValue = a.total_orders;
          bValue = b.total_orders;
          break;
        case 'выручка':
          aValue = a.total_revenue;
          bValue = b.total_revenue;
          break;
        case 'ctr':
          aValue = a.avg_ctr;
          bValue = b.avg_ctr;
          break;
        case 'cpc':
          aValue = a.avg_cpc;
          bValue = b.avg_cpc;
          break;
        case 'конв_корзина':
          aValue = a.avg_add_to_cart_conversion;
          bValue = b.avg_add_to_cart_conversion;
          break;
        case 'конверсия':
          aValue = a.avg_conversion;
          bValue = b.avg_conversion;
          break;
        case 'дрр':
          aValue = a.avg_drr;
          bValue = b.avg_drr;
          break;
        default:
          return 0;
      }

      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  // Вычисляем общие метрики ОТ ВСЕХ КАМПАНИЙ за выбранный период (не от отфильтрованных)
  const totalMetrics = campaignsData
    ? campaignsData.reduce(
        (acc, campaign) => {
          acc.totalSpent += campaign.total_money_spent;
          acc.totalRevenue += campaign.total_revenue;
          return acc;
        },
        { totalSpent: 0, totalRevenue: 0 }
      )
    : { totalSpent: 0, totalRevenue: 0 };

  const totalDRR = totalMetrics.totalRevenue > 0
    ? (totalMetrics.totalSpent / totalMetrics.totalRevenue) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Megaphone className="w-8 h-8" />
          Аналитика Продвижения
        </h1>
        <p className="text-muted-foreground mt-2">
          Анализ эффективности продвижения товаров и маркетинговых кампаний
        </p>
      </div>

      {/* Фильтры - всегда видимые */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Фильтры
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по кампании, товару, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              className="w-auto"
            />
          </div>
        </CardContent>
      </Card>

      {/* Общие метрики */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общие расходы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMetrics.totalSpent)}</div>
            <p className="text-xs text-muted-foreground mt-1">За выбранный период</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общая выручка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalMetrics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">От продвижения</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общий ДРР
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPercent(totalDRR)}</div>
            <p className="text-xs text-muted-foreground mt-1">Доля рекламных расходов</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="w-5 h-5" />
                    Рекламные кампании
                  </CardTitle>
                  <CardDescription>
                    Иерархический просмотр кампаний и товаров с метриками эффективности
                  </CardDescription>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings className="h-4 w-4" />
                      Столбцы
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Отображаемые столбцы</h4>
                      <div className="space-y-2">
                        {Object.entries(visibleColumns).map(([key, value]) => (
                          <div key={key} className="flex items-center space-x-2">
                            <Checkbox
                              id={key}
                              checked={value}
                              onCheckedChange={() => toggleColumn(key as keyof typeof visibleColumns)}
                            />
                            <label
                              htmlFor={key}
                              className="text-sm font-normal cursor-pointer select-none capitalize"
                            >
                              {key.replace(/_/g, ' ')}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground space-y-4">
                  <p className="text-lg font-medium">Нет данных за выбранный период</p>
                  <div className="space-y-2 text-sm">
                    <p>
                      Период: <span className="font-medium">{format(dateRange.start, "dd.MM.yyyy", { locale: ru })}</span> - <span className="font-medium">{format(dateRange.end, "dd.MM.yyyy", { locale: ru })}</span>
                    </p>
                    <p className="text-xs">
                      Попробуйте изменить период в фильтрах выше или убедитесь, что данные по продвижениям загружены в таблицу ozon_performance_summary
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateRange({
                          start: subDays(new Date(), 180),
                          end: new Date(),
                        });
                      }}
                      className="mt-4"
                    >
                      Расширить период до 180 дней
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Кампания</TableHead>
                        {visibleColumns.товаров && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('товаров')}
                            >
                              Товаров
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.расходы && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('расходы')}
                            >
                              Расходы
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.показы && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('показы')}
                            >
                              Показы
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.клики && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('клики')}
                            >
                              Клики
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.в_корзину && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('в_корзину')}
                            >
                              В корзину
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.избранное && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('избранное')}
                            >
                              Избранное
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.заказы && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('заказы')}
                            >
                              Заказы
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.выручка && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('выручка')}
                            >
                              Выручка
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.ctr && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('ctr')}
                            >
                              CTR
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.cpc && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('cpc')}
                            >
                              CPC
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.конв_корзина && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('конв_корзина')}
                            >
                              Конв.→🛒
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.конверсия && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('конверсия')}
                            >
                              Конверсия
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                        {visibleColumns.дрр && (
                          <TableHead className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={() => handleSort('дрр')}
                            >
                              ДРР
                              <ArrowUpDown className="ml-2 h-4 w-4" />
                            </Button>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCampaigns.map((campaign) => {
                        const isExpanded = expandedCampaigns.has(campaign.campaign_id);
                        return (
                          <>
                            <TableRow
                              key={campaign.campaign_id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => toggleCampaign(campaign.campaign_id)}
                            >
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCampaign(campaign.campaign_id);
                                  }}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{campaign.campaign_name}</div>
                                  {campaign.campaign_type && campaign.campaign_type !== 'SKU' && (
                                    <Badge variant="secondary" className="text-xs mt-1">
                                      {campaign.campaign_type}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              {visibleColumns.товаров && (
                                <TableCell className="text-center">{campaign.sku_count}</TableCell>
                              )}
                              {visibleColumns.расходы && (
                                <TableCell className="text-center font-medium">
                                  {formatCurrency(campaign.total_money_spent)}
                                </TableCell>
                              )}
                              {visibleColumns.показы && (
                                <TableCell className="text-center">
                                  {campaign.total_views.toLocaleString("ru-RU")}
                                </TableCell>
                              )}
                              {visibleColumns.клики && (
                                <TableCell className="text-center">
                                  {campaign.total_clicks.toLocaleString("ru-RU")}
                                </TableCell>
                              )}
                              {visibleColumns.в_корзину && (
                                <TableCell className="text-center">
                                  {campaign.total_add_to_cart.toLocaleString("ru-RU")}
                                </TableCell>
                              )}
                              {visibleColumns.избранное && (
                                <TableCell className="text-center">
                                  {campaign.total_favorites.toLocaleString("ru-RU")}
                                </TableCell>
                              )}
                              {visibleColumns.заказы && (
                                <TableCell className="text-center">
                                  {campaign.total_orders.toLocaleString("ru-RU")}
                                </TableCell>
                              )}
                              {visibleColumns.выручка && (
                                <TableCell className="text-center">
                                  {formatCurrency(campaign.total_revenue)}
                                </TableCell>
                              )}
                              {visibleColumns.ctr && (
                                <TableCell className="text-center">
                                  {formatPercent(campaign.avg_ctr)}
                                </TableCell>
                              )}
                              {visibleColumns.cpc && (
                                <TableCell className="text-center">
                                  {formatCurrency(campaign.avg_cpc)}
                                </TableCell>
                              )}
                              {visibleColumns.конв_корзина && (
                                <TableCell className="text-center">
                                  {formatPercent(campaign.avg_add_to_cart_conversion)}
                                </TableCell>
                              )}
                              {visibleColumns.конверсия && (
                                <TableCell className="text-center">
                                  {formatPercent(campaign.avg_conversion)}
                                </TableCell>
                              )}
                              {visibleColumns.дрр && (
                                <TableCell className="text-center">
                                  {campaign.avg_drr > 0 ? formatPercent(campaign.avg_drr) : "—"}
                                </TableCell>
                              )}
                            </TableRow>
                            {isExpanded &&
                              campaign.products.map((product) => {
                                const productKey = `${campaign.campaign_id}-${product.sku}`;
                                const isProductExpanded = expandedProducts.has(productKey);
                                return (
                                  <>
                                    <TableRow
                                      key={productKey}
                                      className="bg-muted/30 cursor-pointer hover:bg-muted/50"
                                      onClick={() => toggleProduct(productKey)}
                                    >
                                      <TableCell>
                                        <div className="flex items-center gap-2 pl-6">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleProduct(productKey);
                                            }}
                                          >
                                            {isProductExpanded ? (
                                              <ChevronDown className="h-4 w-4" />
                                            ) : (
                                              <ChevronRight className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-3">
                                          {product.product_image ? (
                                            <img
                                              src={product.product_image}
                                              alt={product.product_name || product.sku}
                                              className="w-8 h-8 object-cover rounded"
                                            />
                                          ) : (
                                            <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                                              <Package className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                          )}
                                          <div>
                                            <div className="font-medium text-sm">
                                              {product.product_name || `SKU: ${product.sku}`}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                              SKU: {product.sku}
                                              {product.offer_id && ` • Артикул: ${product.offer_id}`}
                                            </div>
                                          </div>
                                        </div>
                                      </TableCell>
                                      {visibleColumns.товаров && (
                                        <TableCell className="text-center">—</TableCell>
                                      )}
                                      {visibleColumns.расходы && (
                                        <TableCell className="text-center font-medium text-sm">
                                          {formatCurrency(product.total_money_spent)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.показы && (
                                        <TableCell className="text-center text-sm">
                                          {product.total_views.toLocaleString("ru-RU")}
                                        </TableCell>
                                      )}
                                      {visibleColumns.клики && (
                                        <TableCell className="text-center text-sm">
                                          {product.total_clicks.toLocaleString("ru-RU")}
                                        </TableCell>
                                      )}
                                      {visibleColumns.в_корзину && (
                                        <TableCell className="text-center text-sm">
                                          {product.total_add_to_cart.toLocaleString("ru-RU")}
                                        </TableCell>
                                      )}
                                      {visibleColumns.избранное && (
                                        <TableCell className="text-center text-sm">
                                          {product.total_favorites.toLocaleString("ru-RU")}
                                        </TableCell>
                                      )}
                                      {visibleColumns.заказы && (
                                        <TableCell className="text-center text-sm">
                                          {product.total_orders.toLocaleString("ru-RU")}
                                        </TableCell>
                                      )}
                                      {visibleColumns.выручка && (
                                        <TableCell className="text-center text-sm">
                                          {formatCurrency(product.total_revenue)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.ctr && (
                                        <TableCell className="text-center text-sm">
                                          {formatPercent(product.avg_ctr)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.cpc && (
                                        <TableCell className="text-center text-sm">
                                          {formatCurrency(product.avg_cpc)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.конв_корзина && (
                                        <TableCell className="text-center text-sm">
                                          {formatPercent(product.avg_add_to_cart_conversion)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.конверсия && (
                                        <TableCell className="text-center text-sm">
                                          {formatPercent(product.avg_conversion)}
                                        </TableCell>
                                      )}
                                      {visibleColumns.дрр && (
                                        <TableCell className="text-center text-sm">
                                          {product.avg_drr > 0 ? formatPercent(product.avg_drr) : "—"}
                                        </TableCell>
                                      )}
                                    </TableRow>
                                    {isProductExpanded && (
                                      <TableRow key={`${productKey}-details`} className="bg-muted/10">
                                        <TableCell colSpan={20} className="p-4">
                                          <div className="space-y-2 text-sm">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                              <div>
                                                <div className="text-muted-foreground">Период</div>
                                                <div className="font-medium">
                                                  {format(new Date(product.date_range.min), "dd.MM.yyyy", {
                                                    locale: ru,
                                                  })}{" "}
                                                  -{" "}
                                                  {format(new Date(product.date_range.max), "dd.MM.yyyy", {
                                                    locale: ru,
                                                  })}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground">Дней в кампании</div>
                                                <div className="font-medium">{product.days_count}</div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground">Средний расход/день</div>
                                                <div className="font-medium">
                                                  {formatCurrency(
                                                    product.total_money_spent / product.days_count
                                                  )}
                                                </div>
                                              </div>
                                              <div>
                                                <div className="text-muted-foreground">Средний заказов/день</div>
                                                <div className="font-medium">
                                                  {(product.total_orders / product.days_count).toFixed(1)}
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </>
                                );
                              })}
                          </>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  );
};

export default PromotionAnalytics;
