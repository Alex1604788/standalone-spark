import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, HelpCircle, Clock, AlertTriangle, TrendingUp, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface DashboardKPIs {
  unansweredReviews: number;
  unansweredQuestions: number;
  totalReviewsWeek: number;
  totalQuestionsWeek: number;
  reviewsWeekChange: number;
  questionsWeekChange: number;
  avgResponseTimeReviews: number; // в минутах
  avgResponseTimeQuestions: number; // в минутах
  negativeReviewsPercent: number;
  negativeReviewsCount: number;
}

interface AnomalyProduct {
  product_id: string;
  product_name: string;
  product_image?: string;
  negativeCount: number;
  normalAverage: number;
  multiplier: number;
}

interface WeeklySummary {
  text: string;
  generated_at: string;
}

interface AnalyticsDashboardProps {
  onNavigateToReviews: () => void;
  onNavigateToQuestions: () => void;
  onNavigateToDiagnostics: (productId: string) => void;
}

export const AnalyticsDashboard = ({
  onNavigateToReviews,
  onNavigateToQuestions,
  onNavigateToDiagnostics,
}: AnalyticsDashboardProps) => {
  const { toast } = useToast();
  const [kpis, setKpis] = useState<DashboardKPIs>({
    unansweredReviews: 0,
    unansweredQuestions: 0,
    totalReviewsWeek: 0,
    totalQuestionsWeek: 0,
    reviewsWeekChange: 0,
    questionsWeekChange: 0,
    avgResponseTimeReviews: 0,
    avgResponseTimeQuestions: 0,
    negativeReviewsPercent: 0,
    negativeReviewsCount: 0,
  });
  const [anomalies, setAnomalies] = useState<AnomalyProduct[]>([]);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Получаем маркетплейсы пользователя (как в других компонентах)
  const { data: marketplaces } = useQuery({
    queryKey: ["user-marketplaces"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id);

      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    if (marketplaces && marketplaces.length > 0) {
      loadDashboardData();
    } else if (marketplaces && marketplaces.length === 0) {
      setLoading(false);
      setError("У вас нет подключенных маркетплейсов");
    }
  }, [marketplaces]);

  const loadDashboardData = async () => {
    if (!marketplaces || marketplaces.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const marketplaceIds = marketplaces.map((m) => m.id);
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // 1. Неотвеченные отзывы и вопросы (через products join)
      const { count: unansweredReviews } = await supabase
        .from("reviews")
        .select("id, products!inner(marketplace_id)", { count: "exact", head: true })
        .eq("segment", "unanswered")
        .in("products.marketplace_id", marketplaceIds)
        .is("deleted_at", null);

      const { count: unansweredQuestions } = await supabase
        .from("questions")
        .select("id, products!inner(marketplace_id)", { count: "exact", head: true })
        .eq("is_answered", false)
        .in("products.marketplace_id", marketplaceIds);

      // 2. Всего за неделю
      const { data: reviewsWeek } = await supabase
        .from("reviews")
        .select("review_date, products!inner(marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .gte("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null);

      const { data: questionsWeek } = await supabase
        .from("questions")
        .select("question_date, products!inner(marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .gte("question_date", sevenDaysAgo.toISOString());

      // Предыдущая неделя для сравнения
      const { data: reviewsPrevWeek } = await supabase
        .from("reviews")
        .select("review_date, products!inner(marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .gte("review_date", fourteenDaysAgo.toISOString())
        .lt("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null);

      const { data: questionsPrevWeek } = await supabase
        .from("questions")
        .select("question_date, products!inner(marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .gte("question_date", fourteenDaysAgo.toISOString())
        .lt("question_date", sevenDaysAgo.toISOString());

      const totalReviewsWeek = reviewsWeek?.length || 0;
      const totalQuestionsWeek = questionsWeek?.length || 0;
      const totalReviewsPrevWeek = reviewsPrevWeek?.length || 0;
      const totalQuestionsPrevWeek = questionsPrevWeek?.length || 0;

      const reviewsWeekChange =
        totalReviewsPrevWeek > 0
          ? ((totalReviewsWeek - totalReviewsPrevWeek) / totalReviewsPrevWeek) * 100
          : totalReviewsWeek > 0
            ? 100
            : 0;
      const questionsWeekChange =
        totalQuestionsPrevWeek > 0
          ? ((totalQuestionsWeek - totalQuestionsPrevWeek) / totalQuestionsPrevWeek) * 100
          : totalQuestionsWeek > 0
            ? 100
            : 0;

      // 3. Среднее время ответа (получаем первый опубликованный ответ)
      const { data: reviewsWithReplies } = await supabase
        .from("reviews")
        .select(`
          id,
          review_date,
          replies(id, published_at, status, created_at)
        `)
        .in("products!inner.marketplace_id", marketplaceIds)
        .gte("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null)
        .limit(1000);

      const { data: questionsWithReplies } = await supabase
        .from("questions")
        .select(`
          id,
          question_date,
          replies(id, published_at, status, created_at)
        `)
        .in("products!inner.marketplace_id", marketplaceIds)
        .gte("question_date", sevenDaysAgo.toISOString())
        .limit(1000);

      let totalResponseTimeReviews = 0;
      let countReviews = 0;
      reviewsWithReplies?.forEach((review: any) => {
        // Находим первый опубликованный ответ
        const publishedReply = review.replies
          ?.filter((r: any) => r.status === "published" && r.published_at)
          .sort((a: any, b: any) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())[0];

        if (publishedReply?.published_at) {
          const reviewDate = new Date(review.review_date);
          const replyDate = new Date(publishedReply.published_at);
          const diffMinutes = (replyDate.getTime() - reviewDate.getTime()) / (1000 * 60);
          if (diffMinutes > 0) {
            totalResponseTimeReviews += diffMinutes;
            countReviews++;
          }
        }
      });

      let totalResponseTimeQuestions = 0;
      let countQuestions = 0;
      questionsWithReplies?.forEach((question: any) => {
        // Находим первый опубликованный ответ
        const publishedReply = question.replies
          ?.filter((r: any) => r.status === "published" && r.published_at)
          .sort((a: any, b: any) => new Date(a.published_at).getTime() - new Date(b.published_at).getTime())[0];

        if (publishedReply?.published_at) {
          const questionDate = new Date(question.question_date);
          const replyDate = new Date(publishedReply.published_at);
          const diffMinutes = (replyDate.getTime() - questionDate.getTime()) / (1000 * 60);
          if (diffMinutes > 0) {
            totalResponseTimeQuestions += diffMinutes;
            countQuestions++;
          }
        }
      });

      const avgResponseTimeReviews = countReviews > 0 ? totalResponseTimeReviews / countReviews : 0;
      const avgResponseTimeQuestions = countQuestions > 0 ? totalResponseTimeQuestions / countQuestions : 0;

      // 4. Доля негативных отзывов (1-3⭐)
      const { data: negativeReviews } = await supabase
        .from("reviews")
        .select("id, products!inner(marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .lte("rating", 3)
        .gte("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null);

      const negativeReviewsCount = negativeReviews?.length || 0;
      const negativeReviewsPercent =
        totalReviewsWeek > 0 ? (negativeReviewsCount / totalReviewsWeek) * 100 : 0;

      setKpis({
        unansweredReviews: unansweredReviews || 0,
        unansweredQuestions: unansweredQuestions || 0,
        totalReviewsWeek,
        totalQuestionsWeek,
        reviewsWeekChange,
        questionsWeekChange,
        avgResponseTimeReviews,
        avgResponseTimeQuestions,
        negativeReviewsPercent,
        negativeReviewsCount,
      });

      // 5. Аномальный рост негатива
      await loadAnomalies(marketplaceIds);

      // 6. ИИ-сводка недели
      await loadWeeklySummary();
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
      setError(error.message || "Не удалось загрузить данные");
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные дашборда",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAnomalies = async (marketplaceIds: string[]) => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);

      // Получаем негативные отзывы за последние 7 дней по товарам
      const { data: recentNegative } = await supabase
        .from("reviews")
        .select("product_id, rating, products!inner(id, marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .lte("rating", 3)
        .gte("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null);

      // Получаем негативные отзывы за предыдущие 4 недели (для нормы)
      const { data: historicalNegative } = await supabase
        .from("reviews")
        .select("product_id, rating, products!inner(id, marketplace_id)")
        .in("products.marketplace_id", marketplaceIds)
        .lte("rating", 3)
        .gte("review_date", thirtyFiveDaysAgo.toISOString())
        .lt("review_date", sevenDaysAgo.toISOString())
        .is("deleted_at", null);

      // Группируем по товарам
      const recentByProduct = new Map<string, number>();
      recentNegative?.forEach((r) => {
        if (r.product_id) {
          recentByProduct.set(r.product_id, (recentByProduct.get(r.product_id) || 0) + 1);
        }
      });

      const historicalByProduct = new Map<string, number>();
      historicalNegative?.forEach((r) => {
        if (r.product_id) {
          historicalByProduct.set(r.product_id, (historicalByProduct.get(r.product_id) || 0) + 1);
        }
      });

      // Получаем информацию о всех товарах одним запросом
      const productIds = Array.from(new Set([...recentByProduct.keys(), ...historicalByProduct.keys()]));
      if (productIds.length === 0) {
        setAnomalies([]);
        return;
      }

      const { data: products } = await supabase
        .from("products")
        .select("id, name, image_url")
        .in("id", productIds);

      const productMap = new Map(products?.map((p) => [p.id, p]) || []);

      // Вычисляем норму (среднее за 4 недели) и находим аномалии
      const anomaliesList: AnomalyProduct[] = [];
      const threshold = 3; // x3 от нормы

      for (const [productId, recentCount] of recentByProduct.entries()) {
        const historicalCount = historicalByProduct.get(productId) || 0;
        const normalAverage = historicalCount / 4; // среднее за неделю за 4 недели

        if (normalAverage > 0 && recentCount / normalAverage >= threshold) {
          const product = productMap.get(productId);
          if (product) {
            anomaliesList.push({
              product_id: productId,
              product_name: product.name || "Неизвестный товар",
              product_image: product.image_url || undefined,
              negativeCount: recentCount,
              normalAverage,
              multiplier: Math.round((recentCount / normalAverage) * 10) / 10,
            });
          }
        }
      }

      // Сортируем по множителю (самые аномальные сверху)
      anomaliesList.sort((a, b) => b.multiplier - a.multiplier);
      setAnomalies(anomaliesList.slice(0, 10)); // Топ 10
    } catch (error) {
      console.error("Error loading anomalies:", error);
    }
  };

  const loadWeeklySummary = async () => {
    try {
      // Вызываем edge function для генерации ИИ-сводки
      const { data, error } = await supabase.functions.invoke("generate-weekly-summary", {
        body: { marketplace_ids: marketplaces?.map((m) => m.id) || [] },
      });

      if (error) throw error;
      if (data?.summary) {
        setWeeklySummary({
          text: data.summary,
          generated_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Error loading weekly summary:", error);
      // Fallback: простая сводка без ИИ
      setWeeklySummary({
        text: `За последнюю неделю получено ${kpis.totalReviewsWeek} отзывов (из них ${kpis.negativeReviewsCount} негативных) и ${kpis.totalQuestionsWeek} вопросов. Среднее время ответа — ${Math.round(kpis.avgResponseTimeReviews)} минут.`,
        generated_at: new Date().toISOString(),
      });
    }
  };

  const formatResponseTime = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}ч ${mins}мин` : `${hours}ч`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive font-medium">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Карточки */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Карточка 1: Неотвеченные */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Неотвеченные</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div
                className="flex items-center justify-between hover:bg-muted/50 p-2 rounded cursor-pointer transition-colors"
                onClick={() => {
                  window.location.href = "/app/reviews/unanswered";
                }}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Отзывы</span>
                </div>
                <span className="text-2xl font-bold">{kpis.unansweredReviews}</span>
              </div>
              <div
                className="flex items-center justify-between hover:bg-muted/50 p-2 rounded cursor-pointer transition-colors"
                onClick={() => {
                  window.location.href = "/app/questions/unanswered";
                }}
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Вопросы</span>
                </div>
                <span className="text-2xl font-bold">{kpis.unansweredQuestions}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Карточка 2: Всего за неделю */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Всего за неделю</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Отзывы</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{kpis.totalReviewsWeek}</span>
                  {kpis.reviewsWeekChange !== 0 && (
                    <span
                      className={`text-xs flex items-center gap-1 ${
                        kpis.reviewsWeekChange > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      <TrendingUp
                        className={`w-3 h-3 ${kpis.reviewsWeekChange < 0 ? "rotate-180" : ""}`}
                      />
                      {kpis.reviewsWeekChange > 0 ? "+" : ""}
                      {kpis.reviewsWeekChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Вопросы</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{kpis.totalQuestionsWeek}</span>
                  {kpis.questionsWeekChange !== 0 && (
                    <span
                      className={`text-xs flex items-center gap-1 ${
                        kpis.questionsWeekChange > 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      <TrendingUp
                        className={`w-3 h-3 ${kpis.questionsWeekChange < 0 ? "rotate-180" : ""}`}
                      />
                      {kpis.questionsWeekChange > 0 ? "+" : ""}
                      {kpis.questionsWeekChange.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Карточка 3: Среднее время ответа */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onNavigateToReviews}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Среднее время ответа</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Отзывы</span>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{formatResponseTime(kpis.avgResponseTimeReviews)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Вопросы</span>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{formatResponseTime(kpis.avgResponseTimeQuestions)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Карточка 4: Доля негативных отзывов */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Доля негативных отзывов (1–3⭐)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="space-y-2 cursor-pointer"
              onClick={() => {
                // Переходим на страницу отзывов с фильтром по негативным
                window.location.href = "/app/reviews/unanswered?rating=1,2,3";
              }}
            >
              <div className="text-3xl font-bold">{kpis.negativeReviewsPercent.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground hover:text-primary transition-colors">
                {kpis.negativeReviewsCount} из {kpis.totalReviewsWeek} отзывов →
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Аномальный рост негатива */}
      {anomalies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Аномальный рост негативных отзывов
            </CardTitle>
            <CardDescription>
              Товары с необычно высоким количеством негативных отзывов за последнюю неделю
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.product_id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onNavigateToDiagnostics(anomaly.product_id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {anomaly.product_image ? (
                      <img
                        src={anomaly.product_image}
                        alt={anomaly.product_name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                        <MessageSquare className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{anomaly.product_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {anomaly.negativeCount} негативных за неделю (норма: {anomaly.normalAverage.toFixed(1)})
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-600">x{anomaly.multiplier}</div>
                    <div className="text-xs text-muted-foreground">от нормы</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ИИ-сводка недели */}
      {weeklySummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              ИИ-сводка недели
            </CardTitle>
            <CardDescription>
              Автоматически сгенерированная сводка на основе данных за последнюю неделю
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground whitespace-pre-line">{weeklySummary.text}</p>
              <p className="text-xs text-muted-foreground mt-4">
                Сгенерировано:{" "}
                {formatDistanceToNow(new Date(weeklySummary.generated_at), {
                  addSuffix: true,
                  locale: ru,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Понедельная динамика (заглушка) */}
      <Card>
        <CardHeader>
          <CardTitle>Понедельная динамика</CardTitle>
          <CardDescription>За последние 6–8 недель</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            График динамики будет добавлен в следующей итерации
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
