import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, MessageSquare, HelpCircle, LayoutDashboard } from "lucide-react";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { AnalyticsReviews } from "./AnalyticsReviews";
import { AnalyticsQuestions } from "./AnalyticsQuestions";

const ReviewsQuestionsAnalytics = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [reviewsFilter, setReviewsFilter] = useState<"all" | "negative" | "unanswered">("all");
  const [questionsFilter, setQuestionsFilter] = useState<"all" | "unanswered">("all");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const handleNavigateToReviews = () => {
    setReviewsFilter("unanswered");
    setActiveTab("reviews");
  };

  const handleNavigateToQuestions = () => {
    setQuestionsFilter("unanswered");
    setActiveTab("questions");
  };

  const handleNavigateToDiagnostics = (productId: string) => {
    setSelectedProductId(productId);
    // Можно добавить навигацию на страницу диагностики, если она есть
    // или открыть модальное окно
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          Аналитика Отзывов и Вопросов
        </h1>
        <p className="text-muted-foreground mt-2">
          Метрики эффективности работы с отзывами и вопросами покупателей
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" />
            Дашборд
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Отзывы
          </TabsTrigger>
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4" />
            Вопросы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <AnalyticsDashboard
            onNavigateToReviews={handleNavigateToReviews}
            onNavigateToQuestions={handleNavigateToQuestions}
            onNavigateToDiagnostics={handleNavigateToDiagnostics}
          />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4">
          <AnalyticsReviews
            initialFilter={reviewsFilter}
            onNavigateToDiagnostics={handleNavigateToDiagnostics}
          />
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <AnalyticsQuestions
            initialFilter={questionsFilter}
            onNavigateToDiagnostics={handleNavigateToDiagnostics}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReviewsQuestionsAnalytics;
