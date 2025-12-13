import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MessageSquare, HelpCircle } from "lucide-react";

const ReviewsQuestionsAnalytics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          Аналитика Отзывов и Вопросов
        </h1>
        <p className="text-muted-foreground mt-2">
          Детальная аналитика по отзывам и вопросам покупателей
        </p>
      </div>

      <Tabs defaultValue="reviews" className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Отзывы
          </TabsTrigger>
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            Вопросы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reviews" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Аналитика отзывов
              </CardTitle>
              <CardDescription>
                Статистика по отзывам: рейтинги, ответы, динамика
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет детальная аналитика по отзывам: распределение по рейтингам,
                  скорость ответов, популярные товары и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5" />
                Аналитика вопросов
              </CardTitle>
              <CardDescription>
                Статистика по вопросам покупателей: темы, ответы, конверсия
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Раздел в разработке</p>
                <p className="text-sm mt-2">
                  Здесь будет аналитика по вопросам: популярные темы, скорость ответов,
                  влияние на продажи и многое другое
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReviewsQuestionsAnalytics;

