import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Clock, MessageSquare, Star, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AnalyticsData {
  totalReviews: number;
  answeredReviews: number;
  totalQuestions: number;
  answeredQuestions: number;
  coverage: number;
  avgRating: number;
  avgResponseTime: number;
  recentMetrics: Array<{
    metric_date: string;
    total_reviews: number;
    answered_reviews: number;
    rating_change: number;
  }>;
}

const Analytics = () => {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalReviews: 0,
    answeredReviews: 0,
    totalQuestions: 0,
    answeredQuestions: 0,
    coverage: 0,
    avgRating: 0,
    avgResponseTime: 0,
    recentMetrics: [],
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get reviews stats
      const { data: reviewsData } = await supabase
        .from("reviews")
        .select("rating, is_answered")
        .order("review_date", { ascending: false });

      // Get questions stats
      const { data: questionsData } = await supabase
        .from("questions")
        .select("is_answered")
        .order("question_date", { ascending: false });

      // Get recent metrics
      const { data: metricsData } = await supabase
        .from("analytics_metrics")
        .select("*")
        .eq("user_id", user.id)
        .order("metric_date", { ascending: false })
        .limit(30);

      const totalReviews = reviewsData?.length || 0;
      const answeredReviews = reviewsData?.filter(r => r.is_answered).length || 0;
      const totalQuestions = questionsData?.length || 0;
      const answeredQuestions = questionsData?.filter(q => q.is_answered).length || 0;

      const totalItems = totalReviews + totalQuestions;
      const answeredItems = answeredReviews + answeredQuestions;
      const coverage = totalItems > 0 ? (answeredItems / totalItems) * 100 : 0;

      const avgRating = reviewsData && reviewsData.length > 0
        ? reviewsData.reduce((sum, r) => sum + r.rating, 0) / reviewsData.length
        : 0;

      setAnalytics({
        totalReviews,
        answeredReviews,
        totalQuestions,
        answeredQuestions,
        coverage,
        avgRating,
        avgResponseTime: 0, // Calculate from actual reply timestamps
        recentMetrics: metricsData || [],
      });
    } catch (error) {
      console.error("Error loading analytics:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить аналитику",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Всего отзывов",
      value: analytics.totalReviews,
      icon: MessageSquare,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Coverage (Охват)",
      value: `${analytics.coverage.toFixed(1)}%`,
      icon: BarChart3,
      color: "text-accent",
      bgColor: "bg-accent/10",
      subtitle: `${analytics.answeredReviews + analytics.answeredQuestions} из ${analytics.totalReviews + analytics.totalQuestions}`,
    },
    {
      title: "Средний рейтинг",
      value: analytics.avgRating.toFixed(1),
      icon: Star,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10",
    },
    {
      title: "SLA (время ответа)",
      value: `${analytics.avgResponseTime}ч`,
      icon: Clock,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
      subtitle: "медиана",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Аналитика
          </h1>
          <p className="text-muted-foreground">
            Метрики эффективности работы с отзывами и вопросами
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Card
              key={index}
              className="p-6 hover:shadow-elegant transition-shadow animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold">
                    {loading ? "..." : stat.value}
                  </p>
                  {stat.subtitle && (
                    <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
                  )}
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Отзывы
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Всего получено</span>
                <span className="text-2xl font-bold">{analytics.totalReviews}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">С ответами</span>
                <span className="text-2xl font-bold text-green-600">{analytics.answeredReviews}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Без ответа</span>
                <span className="text-2xl font-bold text-orange-600">
                  {analytics.totalReviews - analytics.answeredReviews}
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Вопросы
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Всего получено</span>
                <span className="text-2xl font-bold">{analytics.totalQuestions}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">С ответами</span>
                <span className="text-2xl font-bold text-green-600">{analytics.answeredQuestions}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Без ответа</span>
                <span className="text-2xl font-bold text-orange-600">
                  {analytics.totalQuestions - analytics.answeredQuestions}
                </span>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Динамика за последние 30 дней
          </h3>
          {analytics.recentMetrics.length > 0 ? (
            <div className="space-y-2">
              {analytics.recentMetrics.slice(0, 10).map((metric, index) => (
                <div key={index} className="flex justify-between items-center py-2 border-b last:border-0">
                  <span className="text-sm text-muted-foreground">
                    {new Date(metric.metric_date).toLocaleDateString('ru-RU')}
                  </span>
                  <div className="flex gap-4">
                    <span className="text-sm">
                      Отзывов: <strong>{metric.total_reviews}</strong>
                    </span>
                    <span className="text-sm">
                      Отвечено: <strong>{metric.answered_reviews}</strong>
                    </span>
                    <span className="text-sm">
                      Δ рейтинг: <strong className={metric.rating_change >= 0 ? "text-green-600" : "text-red-600"}>
                        {metric.rating_change > 0 ? '+' : ''}{metric.rating_change}
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Нет данных за последние дни. Начните работать с отзывами для сбора статистики.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Analytics;
