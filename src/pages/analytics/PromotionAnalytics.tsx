import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Megaphone, Zap, TrendingUp, DollarSign } from "lucide-react";
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
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 62 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

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

  // Запрос к таблице ozon_performance_daily с ПРАВИЛЬНЫМ суммированием orders + orders_model
  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['promotion-campaigns', marketplaceId, startDate, endDate],
    queryFn: async () => {
      if (!marketplaceId) return [];

      const { data, error } = await supabase
        .from('ozon_performance_daily')
        .select(`
          campaign_name,
          stat_date,
          orders,
          orders_model,
          revenue,
          money_spent,
          views,
          clicks
        `)
        .eq('marketplace_id', marketplaceId)
        .gte('stat_date', startDate)
        .lte('stat_date', endDate)
        .order('stat_date', { ascending: false });

      if (error) throw error;

      // Группируем по кампаниям и суммируем orders + orders_model
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

        // ВАЖНО: Суммируем orders + orders_model как в OZON Analytics
        acc[key].total_orders += (row.orders || 0) + (row.orders_model || 0);
        acc[key].total_revenue += row.revenue || 0;
        acc[key].promotion_cost += row.money_spent || 0;
        acc[key].total_views += row.views || 0;
        acc[key].total_clicks += row.clicks || 0;

        return acc;
      }, {} as Record<string, CampaignData>);

      return Object.values(grouped);
    },
    enabled: !!marketplaceId,
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
                Период: {startDate} - {endDate} (последние 62 дня)
                <br />
                <span className="text-xs text-muted-foreground">
                  * Заказы = Обычные заказы + Заказы модели (как в OZON Analytics)
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
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
