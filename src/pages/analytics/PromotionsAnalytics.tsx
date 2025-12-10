import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Tag, Clock, History, TrendingUp } from "lucide-react";

const PromotionsAnalytics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Tag className="w-8 h-8" />
          Аналитика Акций
        </h1>
        <p className="text-muted-foreground mt-2">
          Анализ эффективности акций и скидок на товары
        </p>
      </div>

      <Tabs defaultValue="active" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            Активные
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="w-4 h-4" />
            История
          </TabsTrigger>
          <TabsTrigger value="effectiveness" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Эффективность
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                Активные акции
              </CardTitle>
              <CardDescription>
                Текущие акции и скидки, их статус и результаты
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Tag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет список активных акций: текущие скидки, их статус, результаты,
                  популярные товары в акциях и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5" />
                История акций
              </CardTitle>
              <CardDescription>
                Завершенные акции, их результаты и статистика
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет история акций: завершенные акции, их результаты, статистика,
                  анализ эффективности и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="effectiveness" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Эффективность акций
              </CardTitle>
              <CardDescription>
                Анализ влияния акций на продажи, оптимальные размеры скидок
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет анализ эффективности: влияние акций на продажи, оптимальные
                  размеры скидок, ROI акций, рекомендации по планированию и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PromotionsAnalytics;

