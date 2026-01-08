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
  Calendar,
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

  // Загружаем данные по кампаниям
  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ["promotions-campaigns", marketplace?.id, dateRange],
    queryFn: async () => {
      if (!marketplace?.id) {
        console.log("❌ Нет marketplace.id");
        return [];
      }

      console.log("🔍 Запрос данных для marketplace:", marketplace.id);
      console.log("📅 Период:", format(dateRange.start, "yyyy-MM-dd"), "-", format(dateRange.end, "yyyy-MM-dd"));

      // Сначала проверяем, есть ли вообще данные для этого marketplace
      const { data: checkData, error: checkError } = await supabase
        .from("ozon_performance_daily")
        .select("marketplace_id, stat_date")
        .eq("marketplace_id", marketplace.id)
        .limit(1);
      
      console.log("🔍 Проверка наличия данных:", { checkData, checkError });

      // Проверяем все marketplace_id в таблице для сравнения
      const { data: allMarketplaces } = await supabase
        .from("ozon_performance_daily")
        .select("marketplace_id")
        .limit(10);
      console.log("🔍 Все marketplace_id в таблице (первые 10):", allMarketplaces?.map((m: any) => m.marketplace_id));
      console.log("🔍 Ищем marketplace_id:", marketplace.id, "в списке:", allMarketplaces?.some((m: any) => m.marketplace_id === marketplace.id));

      // Упрощаем запрос - убираем join с products, загрузим их отдельно если нужно
      const { data: performanceData, error } = await supabase
        .from("ozon_performance_daily")
        .select(`
          campaign_id,
          campaign_name,
          campaign_type,
          sku,
          offer_id,
          money_spent,
          views,
          clicks,
          add_to_cart,
          add_to_cart_conversion,
          favorites,
          orders,
          orders_model,
          revenue,
          ctr,
          cpc,
          conversion,
          drr,
          stat_date
        `)
        .eq("marketplace_id", marketplace.id)
        .gte("stat_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("stat_date", format(dateRange.end, "yyyy-MM-dd"))
        .order("stat_date", { ascending: false })
        .limit(100000);

      if (error) {
        console.error("❌ Ошибка загрузки данных продвижений:", error);
        throw error;
      }
      
      console.log("✅ Загружено записей:", performanceData?.length || 0);
      if (performanceData && performanceData.length > 0) {
        console.log("📊 Пример первой записи:", performanceData[0]);
        // Проверяем количество записей с NULL campaign_id
        const nullCampaignCount = performanceData.filter((r: any) => !r.campaign_id || r.campaign_id === "").length;
        const nullCampaignNameCount = performanceData.filter((r: any) => !r.campaign_name).length;
        const nullSkuCount = performanceData.filter((r: any) => !r.sku || r.sku === "").length;
        console.log("📊 Статистика NULL значений:", {
          nullCampaignId: nullCampaignCount,
          nullCampaignName: nullCampaignNameCount,
          nullSku: nullSkuCount,
          total: performanceData.length
        });
      }

      if (!performanceData || performanceData.length === 0) {
        console.log("⚠️ Нет данных в ozon_performance_daily для marketplace:", marketplace.id, "за период:", format(dateRange.start, "yyyy-MM-dd"), "-", format(dateRange.end, "yyyy-MM-dd"));
        // Пробуем загрузить данные за больший период для проверки
        const { data: checkData } = await supabase
          .from("ozon_performance_daily")
          .select("stat_date, marketplace_id")
          .eq("marketplace_id", marketplace.id)
          .order("stat_date", { ascending: false })
          .limit(5);
        if (checkData && checkData.length > 0) {
          console.log("✅ Найдены данные в других периодах. Примеры дат:", checkData.map((d: any) => d.stat_date));
        } else {
          console.log("❌ Данных нет вообще для marketplace:", marketplace.id);
          // Проверяем все marketplace_id в таблице
          const { data: allMarketplaces } = await supabase
            .from("ozon_performance_daily")
            .select("marketplace_id")
            .limit(10);
          console.log("🔍 Примеры marketplace_id в таблице:", allMarketplaces?.map((m: any) => m.marketplace_id));
        }
        return [];
      }

      // Группируем по кампаниям
      const campaignMap = new Map<string, CampaignData>();

      performanceData.forEach((row: any) => {
        // Обрабатываем NULL значения: группируем записи без campaign_id в отдельную категорию
        let campaignId: string;
        if (!row.campaign_id || row.campaign_id === "") {
          // Группируем все записи без campaign_id в одну категорию
          campaignId = "__NO_CAMPAIGN__";
        } else {
          campaignId = String(row.campaign_id);
        }

        const sku = row.sku || `__NULL_SKU_${Math.random()}__`;

        // Пропускаем только записи без sku (критичное поле для группировки)
        if (!row.sku || row.sku === "") {
          console.warn("⚠️ Пропущена запись без sku:", row);
          return;
        }

        if (!campaignMap.has(campaignId)) {
          campaignMap.set(campaignId, {
            campaign_id: campaignId === "__NO_CAMPAIGN__" ? null : campaignId,
            campaign_name: campaignId === "__NO_CAMPAIGN__"
              ? "Без кампании"
              : (row.campaign_name || `Кампания ${campaignId}`),
            campaign_type: row.campaign_type,
            total_money_spent: 0,
            total_views: 0,
            total_clicks: 0,
            total_add_to_cart: 0,
            total_favorites: 0,
            total_orders: 0,
            total_revenue: 0,
            avg_ctr: 0,
            avg_cpc: 0,
            avg_add_to_cart_conversion: 0,
            avg_conversion: 0,
            avg_drr: 0,
            date_range: { min: row.stat_date, max: row.stat_date },
            sku_count: 0,
            products: [],
          });
        }

        const campaign = campaignMap.get(campaignId)!;
        campaign.total_money_spent += Number(row.money_spent || 0);
        campaign.total_views += Number(row.views || 0);
        campaign.total_clicks += Number(row.clicks || 0);
        campaign.total_add_to_cart += Number(row.add_to_cart || 0);
        campaign.total_favorites += Number(row.favorites || 0);
        campaign.total_orders += Number(row.orders || 0) + Number(row.orders_model || 0);
        campaign.total_revenue += Number(row.revenue || 0);

        if (row.stat_date < campaign.date_range.min) {
          campaign.date_range.min = row.stat_date;
        }
        if (row.stat_date > campaign.date_range.max) {
          campaign.date_range.max = row.stat_date;
        }

        // Группируем по товарам (пропускаем если sku NULL)
        if (!row.sku) {
          return;
        }

        let product = campaign.products.find((p) => p.sku === sku);
        if (!product) {
          product = {
            sku,
            offer_id: row.offer_id || null,
            product_name: null, // Загрузим отдельно если нужно
            product_image: null,
            total_money_spent: 0,
            total_views: 0,
            total_clicks: 0,
            total_add_to_cart: 0,
            total_favorites: 0,
            total_orders: 0,
            total_revenue: 0,
            avg_ctr: 0,
            avg_cpc: 0,
            avg_add_to_cart_conversion: 0,
            avg_conversion: 0,
            avg_drr: 0,
            date_range: { min: row.stat_date, max: row.stat_date },
            days_count: 0,
          };
          campaign.products.push(product);
        }

        product.total_money_spent += Number(row.money_spent || 0);
        product.total_views += Number(row.views || 0);
        product.total_clicks += Number(row.clicks || 0);
        product.total_add_to_cart += Number(row.add_to_cart || 0);
        product.total_favorites += Number(row.favorites || 0);
        product.total_orders += Number(row.orders || 0) + Number(row.orders_model || 0);
        product.total_revenue += Number(row.revenue || 0);

        if (row.stat_date < product.date_range.min) {
          product.date_range.min = row.stat_date;
        }
        if (row.stat_date > product.date_range.max) {
          product.date_range.max = row.stat_date;
        }
        product.days_count++;
      });

      // Загружаем информацию о продуктах по SKU
      const allSkus = Array.from(new Set(Array.from(campaignMap.values()).flatMap(c => c.products.map(p => p.sku))));
      if (allSkus.length > 0) {
        const { data: productsData } = await supabase
          .from("products")
          .select("id, name, image_url, sku, marketplace_id")
          .eq("marketplace_id", marketplace.id)
          .in("sku", allSkus);
        
        if (productsData) {
          const productsMap = new Map(productsData.map(p => [p.sku, p]));
          campaignMap.forEach((campaign) => {
            campaign.products.forEach((product) => {
              const productInfo = productsMap.get(product.sku);
              if (productInfo) {
                product.product_name = productInfo.name;
                product.product_image = productInfo.image_url;
              }
            });
          });
        }
      }

      // Вычисляем средние значения и обновляем счетчики
      campaignMap.forEach((campaign) => {
        campaign.sku_count = campaign.products.length;

        if (campaign.total_views > 0) {
          campaign.avg_ctr = (campaign.total_clicks / campaign.total_views) * 100;
        }
        if (campaign.total_clicks > 0) {
          campaign.avg_cpc = campaign.total_money_spent / campaign.total_clicks;
          campaign.avg_add_to_cart_conversion = (campaign.total_add_to_cart / campaign.total_clicks) * 100;
          campaign.avg_conversion = (campaign.total_orders / campaign.total_clicks) * 100;
        }
        if (campaign.total_revenue > 0) {
          campaign.avg_drr = (campaign.total_money_spent / campaign.total_revenue) * 100;
        }

        campaign.products.forEach((product) => {
          if (product.total_views > 0) {
            product.avg_ctr = (product.total_clicks / product.total_views) * 100;
          }
          if (product.total_clicks > 0) {
            product.avg_cpc = product.total_money_spent / product.total_clicks;
            product.avg_add_to_cart_conversion = (product.total_add_to_cart / product.total_clicks) * 100;
            product.avg_conversion = (product.total_orders / product.total_clicks) * 100;
          }
          if (product.total_revenue > 0) {
            product.avg_drr = (product.total_money_spent / product.total_revenue) * 100;
          }
        });
      });

      const campaigns = Array.from(campaignMap.values()).sort(
        (a, b) => b.total_money_spent - a.total_money_spent
      );

      console.log("✅ Сгруппировано кампаний:", campaigns.length);
      if (campaigns.length > 0) {
        console.log("📊 Примеры кампаний:", campaigns.slice(0, 3).map(c => ({
          id: c.campaign_id,
          name: c.campaign_name,
          products: c.products.length,
          money: c.total_money_spent
        })));
      }

      return campaigns;
    },
    enabled: !!marketplace?.id,
  });

  const toggleCampaign = (campaignId: string) => {
    const newExpanded = new Set(expandedCampaigns);
    if (newExpanded.has(campaignId)) {
      newExpanded.delete(campaignId);
    } else {
      newExpanded.add(campaignId);
    }
    setExpandedCampaigns(newExpanded);
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
            <Calendar className="w-5 h-5" />
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
            <div className="flex gap-2 items-center">
              <label className="text-sm font-medium whitespace-nowrap flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Период:
              </label>
              <Input
                type="date"
                value={format(dateRange.start, "yyyy-MM-dd")}
                onChange={(e) =>
                  setDateRange({ ...dateRange, start: new Date(e.target.value) })
                }
                className="w-[160px]"
                title="Начало периода"
              />
              <span className="text-muted-foreground font-medium">—</span>
              <Input
                type="date"
                value={format(dateRange.end, "yyyy-MM-dd")}
                onChange={(e) =>
                  setDateRange({ ...dateRange, end: new Date(e.target.value) })
                }
                className="w-[160px]"
                title="Конец периода"
              />
            </div>
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
                      Попробуйте изменить период в фильтрах выше или убедитесь, что данные по продвижениям загружены в таблицу ozon_performance_daily
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
