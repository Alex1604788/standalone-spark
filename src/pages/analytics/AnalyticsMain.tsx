import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import { AnalyticsReviews } from "./AnalyticsReviews";
import { AnalyticsQuestions } from "./AnalyticsQuestions";
import { ProductDiagnostics } from "./ProductDiagnostics";
import { AnalyticsSettings } from "./AnalyticsSettings";

const AnalyticsMain = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Аналитика
          </h1>
          <p className="text-muted-foreground">
            Анализ отзывов, вопросов и диагностика товаров
          </p>
        </div>

        {/* Табы */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="dashboard">Дашборд</TabsTrigger>
            <TabsTrigger value="reviews">Отзывы</TabsTrigger>
            <TabsTrigger value="questions">Вопросы</TabsTrigger>
            <TabsTrigger value="diagnostics">Диагностика</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <AnalyticsDashboard
              onNavigateToReviews={() => setActiveTab("reviews")}
              onNavigateToQuestions={() => setActiveTab("questions")}
              onNavigateToDiagnostics={(productId) => {
                setSelectedProductId(productId);
                setActiveTab("diagnostics");
              }}
            />
          </TabsContent>

          <TabsContent value="reviews" className="mt-6">
            <AnalyticsReviews
              onNavigateToDiagnostics={(productId) => {
                setSelectedProductId(productId);
                setActiveTab("diagnostics");
              }}
            />
          </TabsContent>

          <TabsContent value="questions" className="mt-6">
            <AnalyticsQuestions
              onNavigateToDiagnostics={(productId) => {
                setSelectedProductId(productId);
                setActiveTab("diagnostics");
              }}
            />
          </TabsContent>

          <TabsContent value="diagnostics" className="mt-6">
            <ProductDiagnostics
              productId={selectedProductId}
              onBack={() => setActiveTab("dashboard")}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <AnalyticsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AnalyticsMain;
