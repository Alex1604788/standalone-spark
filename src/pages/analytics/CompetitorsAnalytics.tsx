import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Users, DollarSign, Star, TrendingUp } from "lucide-react";

const CompetitorsAnalytics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Users className="w-8 h-8" />
          Аналитика Конкурентов
        </h1>
        <p className="text-muted-foreground mt-2">
          Сравнительный анализ с конкурентами: цены, рейтинги, позиции
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Обзор
          </TabsTrigger>
          <TabsTrigger value="prices" className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Цены
          </TabsTrigger>
          <TabsTrigger value="ratings" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            Рейтинги
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Позиции
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Общая статистика конкурентов
              </CardTitle>
              <CardDescription>
                Сводная информация по всем конкурентам
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет общая статистика: количество конкурентов, средние показатели,
                  топ конкурентов и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Сравнение цен
              </CardTitle>
              <CardDescription>
                Анализ ценовой политики конкурентов
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет сравнение цен: динамика изменения, средние цены,
                  ценовые стратегии конкурентов и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ratings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="w-5 h-5" />
                Сравнение рейтингов
              </CardTitle>
              <CardDescription>
                Анализ рейтингов и отзывов конкурентов
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Star className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет сравнение рейтингов: средние оценки, количество отзывов,
                  динамика рейтингов конкурентов и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Позиции в поиске
              </CardTitle>
              <CardDescription>
                Анализ позиций товаров в поиске у конкурентов
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет анализ позиций: позиции в поиске, видимость товаров,
                  сравнение с конкурентами и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompetitorsAnalytics;

