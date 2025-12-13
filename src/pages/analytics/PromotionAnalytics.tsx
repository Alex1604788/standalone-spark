import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Megaphone, Zap, TrendingUp, DollarSign } from "lucide-react";

const PromotionAnalytics = () => {
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
                Список кампаний, их статус, бюджет, результаты
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Megaphone className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет список рекламных кампаний: активные и завершенные кампании,
                  бюджет, результаты, популярные каналы продвижения и многое другое
                </p>
              </div>
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

