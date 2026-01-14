import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart3, Megaphone, Zap, TrendingUp, DollarSign, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface CampaignData {
  campaign_name: string;
  stat_date: string;
  total_orders: number;
  total_revenue: number;
  promotion_cost: number;
  total_views: number;
  total_clicks: number;
}

const PromotionAnalytics = () => {
  const [marketplaceId, setMarketplaceId] = useState<string | null>(null);

  // Загружаем сохраненный период или используем значения по умолчанию
  const getInitialDate = (key: string, defaultDaysAgo: number = 0) => {
    const saved = localStorage.getItem(`promotion-analytics-${key}`);
    if (saved) return saved;
    return new Date(Date.now() - defaultDaysAgo * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(
    getInitialDate('startDate', 62)
  );
  const [endDate, setEndDate] = useState<string>(
    getInitialDate('endDate', 0)
  );

  // Сохраняем период при изменении
  useEffect(() => {
    localStorage.setItem('promotion-analytics-startDate', startDate);
  }, [startDate]);

  useEffect(() => {
    localStorage.setItem('promotion-analytics-endDate', endDate);
  }, [endDate]);

  // Получаем marketplace_id текущего пользователя
  useEffect(() => {
    const fetchMarketplace = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('marketplaces')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (data && !error) {
        setMarketplaceId(data.id);
      }
    };

    fetchMarketplace();
  }, []);

  // Запрос к VIEW ozon_performance_summary с уже агрегированными данными
  const { data: campaigns, isLoading, error: queryError } = useQuery({
    queryKey: ['promotion-campaigns', marketplaceId, startDate, endDate],
    queryFn: async () => {
      if (!marketplaceId) return [];

      console.log('✅ Получен marketplace_id:', marketplaceId);
      console.log('📅 Период:', startDate, '-', endDate);

      const { data, error } = await supabase
        .from('ozon_performance_summary')
        .select(`
          campaign_name,
          stat_date,
          total_orders,
          total_revenue,
          money_spent,
          views,
          clicks
        `)
        .eq('marketplace_id', marketplaceId)
        .gte('stat_date', startDate)
        .lte('stat_date', endDate)
        .order('stat_date', { ascending: false });

      if (error) {
        console.error('❌ Ошибка загрузки данных:', error);
        throw error;
      }

      console.log('✅ Загружено записей:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('📊 Пример первой записи:', data[0]);
      }

      // Группируем по кампаниям (данные уже агрегированы в VIEW)
      const grouped = data.reduce((acc, row) => {
        const key = row.campaign_name || 'Без названия';
        if (!acc[key]) {
          acc[key] = {
            campaign_name: key,
            stat_date: row.stat_date,
            total_orders: 0,
            total_revenue: 0,
            promotion_cost: 0,
            total_views: 0,
            total_clicks: 0,
          };
        }

        // VIEW уже содержит total_orders (orders + orders_model)
        acc[key].total_orders += row.total_orders || 0;
        acc[key].total_revenue += row.total_revenue || 0;
        acc[key].promotion_cost += row.money_spent || 0;
        acc[key].total_views += row.views || 0;
        acc[key].total_clicks += row.clicks || 0;

        return acc;
      }, {} as Record<string, CampaignData>);

      return Object.values(grouped);
    },
    enabled: !!marketplaceId,
    retry: 1,
  });

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

      {/* Фильтры */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4" />
            Фильтры
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="startDate">Период с</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="endDate">по</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  const monthAgo = new Date(today);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  setStartDate(monthAgo.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                Последний месяц
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  const threeMonthsAgo = new Date(today);
                  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                  setStartDate(threeMonthsAgo.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                Последние 3 месяца
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  const sixMonthsAgo = new Date(today);
                  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
                  setStartDate(sixMonthsAgo.toISOString().split('T')[0]);
                  setEndDate(today.toISOString().split('T')[0]);
                }}
              >
                Последние 6 месяцев
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Общие метрики */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общие расходы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns?.reduce((sum, c) => sum + c.promotion_cost, 0).toLocaleString('ru-RU')} ₽
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              За выбранный период
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общая выручка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns?.reduce((sum, c) => sum + c.total_revenue, 0).toLocaleString('ru-RU')} ₽
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              От продвижения
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Общий ДРПР
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns
                ? (
                    (campaigns.reduce((sum, c) => sum + c.promotion_cost, 0) /
                      campaigns.reduce((sum, c) => sum + c.total_revenue, 0)) *
                    100
                  ).toFixed(2)
                : '0.00'}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Доля рекламных расходов
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="campaigns" className="flex items-center gap-2">
            <Megaphone className="w-4 h-4" />
            Кампании
          </TabsTrigger>
          <TabsTrigger value="conversion" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Конверсия
          </TabsTrigger>
          <TabsTrigger value="roi" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            ROI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                Рекламные кампании
              </CardTitle>
              <CardDescription>
                Иерархический просмотр кампаний и товаров с метриками эффективности
                <br />
                <span className="text-xs text-muted-foreground">
                  Попробуйте изменить период в фильтрах выше или убедитесь, что данные по продвижению загружены в таблицу ozon_performance_summary
                  <br />
                  Расширить период до 180 дней
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {queryError ? (
                <div className="text-center py-12">
                  <Megaphone className="w-16 h-16 mx-auto mb-4 opacity-50 text-destructive" />
                  <p className="text-lg font-semibold text-destructive mb-2">Ошибка загрузки данных</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    {queryError.message.includes('relation') || queryError.message.includes('does not exist')
                      ? 'VIEW ozon_performance_summary не найден в базе данных'
                      : queryError.message}
                  </p>
                  {(queryError.message.includes('relation') || queryError.message.includes('does not exist')) && (
                    <div className="bg-muted p-4 rounded-lg text-left max-w-2xl mx-auto">
                      <p className="font-semibold mb-2">💡 Как исправить:</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside">
                        <li>Откройте файл ИНСТРУКЦИЯ_ПРИМЕНЕНИЯ_VIEW_ПРОДВИЖЕНИЯ.md</li>
                        <li>Следуйте инструкциям по применению VIEW</li>
                        <li>После применения обновите страницу (Ctrl+F5)</li>
                      </ol>
                    </div>
                  )}
                </div>
              ) : isLoading ? (
                <div className="text-center py-8">Загрузка...</div>
              ) : campaigns && campaigns.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Кампания</TableHead>
                      <TableHead className="text-right">Заказы*</TableHead>
                      <TableHead className="text-right">Выручка</TableHead>
                      <TableHead className="text-right">Расход</TableHead>
                      <TableHead className="text-right">Показы</TableHead>
                      <TableHead className="text-right">Клики</TableHead>
                      <TableHead className="text-right">CTR</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign, idx) => {
                      const ctr = campaign.total_views > 0
                        ? ((campaign.total_clicks / campaign.total_views) * 100).toFixed(2)
                        : '0.00';

                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{campaign.campaign_name}</TableCell>
                          <TableCell className="text-right">{campaign.total_orders}</TableCell>
                          <TableCell className="text-right">
                            {campaign.total_revenue.toLocaleString('ru-RU')} ₽
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.promotion_cost.toLocaleString('ru-RU')} ₽
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.total_views.toLocaleString('ru-RU')}
                          </TableCell>
                          <TableCell className="text-right">
                            {campaign.total_clicks.toLocaleString('ru-RU')}
                          </TableCell>
                          <TableCell className="text-right">{ctr}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Megaphone className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Нет данных за выбранный период</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conversion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Конверсия
              </CardTitle>
              <CardDescription>
                Анализ конверсии по кампаниям, каналам, товарам
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет анализ конверсии: конверсия по кампаниям, каналам продвижения,
                  товарам, воронка продаж и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roi" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                ROI и эффективность
              </CardTitle>
              <CardDescription>
                Возврат инвестиций, эффективность кампаний, прибыльность
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет анализ ROI: возврат инвестиций по кампаниям, эффективность
                  рекламных каналов, прибыльность продвижения и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PromotionAnalytics;
