import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, Star, AlertTriangle, TrendingDown, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { subDays, startOfWeek, endOfWeek, format } from "date-fns";
import { ru } from "date-fns/locale";

interface ProductDiagnosticsProps {
  productId: string | null;
  onBack: () => void;
}

interface ProductInfo {
  id: string;
  name: string;
  image_url: string | null;
  external_id: string | null;
  offer_id: string | null;
}

interface ReviewSummary {
  total: number;
  negative: number;
  negativeShare: number;
  averageRating: number;
  weeklyTrend: { week: string; total: number; negative: number }[];
}

interface QuestionSummary {
  total: number;
  unanswered: number;
  mainThemes: string[];
}

interface AnomalyInfo {
  isAnomaly: boolean;
  multiplier: number | null;
  startPeriod: string | null;
}

interface AIDiagnosis {
  summary: string;
  categories: {
    quality: { count: number; examples: string[] };
    packaging: { count: number; examples: string[] };
    logistics: { count: number; examples: string[] };
    description: { count: number; examples: string[] };
    size: { count: number; examples: string[] };
  };
  actionsToday: string[];
  actionsPlan: string[];
}

export const ProductDiagnostics = ({ productId, onBack }: ProductDiagnosticsProps) => {
  // Загружаем информацию о товаре
  const { data: productInfo } = useQuery({
    queryKey: ["product-info", productId],
    queryFn: async () => {
      if (!productId) return null;

      const { data, error } = await supabase
        .from("products")
        .select("id, name, image_url, external_id, offer_id")
        .eq("id", productId)
        .single();

      if (error) throw error;
      return data as ProductInfo;
    },
    enabled: !!productId,
  });

  // Загружаем сводку по отзывам
  const { data: reviewSummary } = useQuery({
    queryKey: ["product-review-summary", productId],
    queryFn: async () => {
      if (!productId) return null;

      const { data: reviews } = await supabase
        .from("reviews")
        .select("id, rating, review_date")
        .eq("product_id", productId)
        .order("review_date", { ascending: false });

      if (!reviews) return null;

      const total = reviews.length;
      const negative = reviews.filter((r) => r.rating <= 3).length;
      const negativeShare = total > 0 ? (negative / total) * 100 : 0;
      const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = total > 0 ? totalRating / total : 0;

      // Мини-тренд по неделям (последние 6 недель)
      const now = new Date();
      const weeklyTrend: { week: string; total: number; negative: number }[] = [];

      for (let i = 5; i >= 0; i--) {
        const weekStart = startOfWeek(subDays(now, i * 7), { locale: ru });
        const weekEnd = endOfWeek(subDays(now, i * 7), { locale: ru });
        const weekLabel = format(weekStart, "dd.MM", { locale: ru });

        const weekReviews = reviews.filter((r) => {
          const date = new Date(r.review_date);
          return date >= weekStart && date <= weekEnd;
        });

        weeklyTrend.push({
          week: weekLabel,
          total: weekReviews.length,
          negative: weekReviews.filter((r) => r.rating <= 3).length,
        });
      }

      return {
        total,
        negative,
        negativeShare: Math.round(negativeShare * 10) / 10,
        averageRating: Math.round(averageRating * 10) / 10,
        weeklyTrend,
      } as ReviewSummary;
    },
    enabled: !!productId,
  });

  // Загружаем сводку по вопросам
  const { data: questionSummary } = useQuery({
    queryKey: ["product-question-summary", productId],
    queryFn: async () => {
      if (!productId) return null;

      const { data: questions } = await supabase
        .from("questions")
        .select("id, text, is_answered")
        .eq("product_id", productId);

      if (!questions) return null;

      const total = questions.length;
      const unanswered = questions.filter((q) => !q.is_answered).length;

      // Определяем основные темы
      const themes: { [key: string]: number } = {
        "Размеры": 0,
        "Характеристики": 0,
        "Совместимость": 0,
        "Доставка": 0,
        "Другое": 0,
      };

      const keywords = {
        "Размеры": ["размер", "размеры", "большой", "маленький", "подойдет"],
        "Характеристики": ["характеристики", "параметры", "материал", "цвет"],
        "Совместимость": ["совместим", "подходит", "работает"],
        "Доставка": ["доставка", "доставили", "курьер"],
      };

      questions.forEach((q) => {
        const text = (q.text || "").toLowerCase();
        let matched = false;

        for (const [theme, words] of Object.entries(keywords)) {
          if (words.some((word) => text.includes(word))) {
            themes[theme]++;
            matched = true;
            break;
          }
        }

        if (!matched) {
          themes["Другое"]++;
        }
      });

      const mainThemes = Object.entries(themes)
        .filter(([_, count]) => count > 0)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 3)
        .map(([theme]) => theme);

      return {
        total,
        unanswered,
        mainThemes,
      } as QuestionSummary;
    },
    enabled: !!productId,
  });

  // Проверяем аномалии
  const { data: anomalyInfo } = useQuery({
    queryKey: ["product-anomaly", productId],
    queryFn: async () => {
      if (!productId) return null;

      const now = new Date();
      const weekAgo = subDays(now, 7);
      const fourWeeksAgo = subDays(now, 28);

      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating, review_date")
        .eq("product_id", productId)
        .lte("rating", 3);

      if (!reviews || reviews.length === 0) {
        return { isAnomaly: false, multiplier: null, startPeriod: null } as AnomalyInfo;
      }

      const negativeLastWeek = reviews.filter(
        (r) => new Date(r.review_date) >= weekAgo
      ).length;
      const negativeLast4Weeks = reviews.filter(
        (r) => new Date(r.review_date) >= fourWeeksAgo
      ).length;

      const avgNegativePerWeek = negativeLast4Weeks / 4;
      const isAnomaly = avgNegativePerWeek > 0 && negativeLastWeek >= avgNegativePerWeek * 3;
      const multiplier = avgNegativePerWeek > 0
        ? Math.round((negativeLastWeek / avgNegativePerWeek) * 10) / 10
        : null;

      // Находим начало периода аномалии
      let startPeriod: string | null = null;
      if (isAnomaly) {
        const anomalyReviews = reviews
          .filter((r) => new Date(r.review_date) >= fourWeeksAgo)
          .sort((a, b) => new Date(a.review_date).getTime() - new Date(b.review_date).getTime());

        if (anomalyReviews.length > 0) {
          startPeriod = format(new Date(anomalyReviews[0].review_date), "dd.MM.yyyy", { locale: ru });
        }
      }

      return { isAnomaly, multiplier, startPeriod } as AnomalyInfo;
    },
    enabled: !!productId,
  });

  // Генерируем ИИ-диагноз
  const { data: aiDiagnosis } = useQuery({
    queryKey: ["product-ai-diagnosis", productId],
    queryFn: async () => {
      if (!productId) return null;

      // Получаем негативные отзывы
      const { data: negativeReviews } = await supabase
        .from("reviews")
        .select("text, advantages, disadvantages, rating")
        .eq("product_id", productId)
        .lte("rating", 3)
        .limit(50);

      if (!negativeReviews || negativeReviews.length === 0) {
        return {
          summary: "Негативных отзывов не найдено. Товар имеет хорошие показатели.",
          categories: {
            quality: { count: 0, examples: [] },
            packaging: { count: 0, examples: [] },
            logistics: { count: 0, examples: [] },
            description: { count: 0, examples: [] },
            size: { count: 0, examples: [] },
          },
          actionsToday: ["Продолжать поддерживать качество товара и сервиса."],
          actionsPlan: [],
        } as AIDiagnosis;
      }

      // Кластеризация по категориям
      const categories = {
        quality: { count: 0, examples: [] as string[] },
        packaging: { count: 0, examples: [] as string[] },
        logistics: { count: 0, examples: [] as string[] },
        description: { count: 0, examples: [] as string[] },
        size: { count: 0, examples: [] as string[] },
      };

      const keywords = {
        quality: ["качество", "брак", "дефект", "некачественный", "поломка", "сломался", "не работает"],
        packaging: ["упаковка", "упакован", "поврежден", "коробка", "пленка"],
        logistics: ["доставка", "доставили", "курьер", "почта", "транспортировка", "поврежден при доставке"],
        description: ["фото", "описание", "не соответствует", "не так", "другое", "не похоже"],
        size: ["размер", "маленький", "большой", "не подошел", "характеристики", "не тот размер"],
      };

      negativeReviews.forEach((review) => {
        const text = `${review.text || ""} ${review.disadvantages || ""}`.toLowerCase();
        let matched = false;

        for (const [category, words] of Object.entries(keywords)) {
          if (words.some((word) => text.includes(word))) {
            categories[category as keyof typeof categories].count++;
            if (categories[category as keyof typeof categories].examples.length < 2 && review.text) {
              categories[category as keyof typeof categories].examples.push(
                review.text.substring(0, 80)
              );
            }
            matched = true;
            break;
          }
        }
      });

      // Генерируем сводку
      const topCategory = Object.entries(categories)
        .sort(([_, a], [__, b]) => b.count - a.count)[0];

      const summary = topCategory[1].count > 0
        ? `Основная проблема: ${topCategory[0] === "quality" ? "Качество товара" : topCategory[0] === "packaging" ? "Упаковка" : topCategory[0] === "logistics" ? "Логистика" : topCategory[0] === "description" ? "Описание/Фото" : "Размер/Характеристики"} (${topCategory[1].count} упоминаний из ${negativeReviews.length} негативных отзывов).`
        : "Проблемы распределены равномерно по разным категориям.";

      // Генерируем действия
      const actionsToday: string[] = [];
      const actionsPlan: string[] = [];

      if (categories.quality.count > 0) {
        actionsToday.push("Проверить качество товара и связаться с поставщиком.");
        actionsPlan.push("Обсудить с поставщиком улучшение контроля качества.");
      }
      if (categories.packaging.count > 0) {
        actionsToday.push("Улучшить упаковку товара для предотвращения повреждений.");
        actionsPlan.push("Заказать более прочную упаковку у поставщика.");
      }
      if (categories.logistics.count > 0) {
        actionsToday.push("Связаться со службой доставки для улучшения транспортировки.");
        actionsPlan.push("Рассмотреть альтернативные варианты доставки.");
      }
      if (categories.description.count > 0) {
        actionsToday.push("Обновить фотографии и описание товара.");
        actionsPlan.push("Провести фотосессию товара и переписать описание.");
      }
      if (categories.size.count > 0) {
        actionsToday.push("Добавить подробную таблицу размеров и характеристик.");
        actionsPlan.push("Улучшить описание размеров и совместимости.");
      }

      if (actionsToday.length === 0) {
        actionsToday.push("Провести детальный анализ всех негативных отзывов.");
      }

      return {
        summary,
        categories,
        actionsToday,
        actionsPlan,
      } as AIDiagnosis;
    },
    enabled: !!productId,
  });

  const ozonCardUrl = productInfo?.external_id
    ? `https://www.ozon.ru/product/${productInfo.external_id}`
    : null;

  if (!productId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-2xl font-bold">Диагностика товара</h2>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Выберите товар для диагностики</CardTitle>
            <CardDescription>
              Перейдите на вкладку "Отзывы" или "Вопросы" и выберите товар из таблицы для просмотра детальной диагностики
            </CardDescription>
          </CardHeader>
          <CardContent className="py-8 text-center">
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Для просмотра диагностики товара:
              </p>
              <ul className="text-left space-y-2 text-sm text-muted-foreground max-w-md mx-auto">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Перейдите на вкладку "Отзывы" или "Вопросы"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Кликните на строку с товаром в таблице</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  <span>Или кликните на товар в блоке "Аномальный рост негатива" на дашборде</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">Диагностика товара</h2>
        </div>
      </div>

      {productInfo && (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-4">
              {productInfo.image_url ? (
                <img
                  src={productInfo.image_url}
                  alt={productInfo.name}
                  className="w-20 h-20 object-cover rounded-lg"
                />
              ) : (
                <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center">
                  <Star className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1">
                <CardTitle className="mb-2">{productInfo.name}</CardTitle>
                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span>Рейтинг: {reviewSummary?.averageRating.toFixed(1) || "—"}</span>
                  </div>
                  <div>
                    Отзывов: {reviewSummary?.total || 0}
                  </div>
                  <div>
                    Вопросов: {questionSummary?.total || 0}
                  </div>
                  {ozonCardUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(ozonCardUrl, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Карточка OZON
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Reviews by Product */}
      {reviewSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Отзывы по товару</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего отзывов</div>
                <div className="text-2xl font-bold">{reviewSummary.total}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Негативных (1-3⭐)</div>
                <div className="text-2xl font-bold text-destructive">{reviewSummary.negative}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Доля негативных</div>
                <div className="text-2xl font-bold">
                  {reviewSummary.negativeShare}%
                </div>
              </div>
            </div>

            {/* Мини-тренд */}
            <div>
              <div className="text-sm font-medium mb-2">Динамика по неделям</div>
              <div className="flex items-end gap-2 h-32">
                {reviewSummary.weeklyTrend.map((week, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                    <div className="flex flex-col items-center gap-1 w-full">
                      <div
                        className="w-full bg-primary/20 rounded-t"
                        style={{ height: `${Math.max((week.total / Math.max(...reviewSummary.weeklyTrend.map(w => w.total))) * 100, 5)}%` }}
                      />
                      <div
                        className="w-full bg-destructive/30 rounded-t"
                        style={{ height: `${week.total > 0 ? (week.negative / week.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{week.week}</div>
                    <div className="text-xs font-medium">{week.total}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions by Product */}
      {questionSummary && (
        <Card>
          <CardHeader>
            <CardTitle>Вопросы по товару</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Всего вопросов</div>
                <div className="text-2xl font-bold">{questionSummary.total}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Неотвеченных</div>
                <div className="text-2xl font-bold text-destructive">
                  {questionSummary.unanswered}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Основные темы</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {questionSummary.mainThemes.map((theme) => (
                    <Badge key={theme} variant="secondary">
                      {theme}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Anomalies */}
      {anomalyInfo?.isAnomaly && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Аномалия: Рост негативных отзывов
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="destructive" className="gap-1">
                  <TrendingDown className="h-3 w-3" />
                  x{anomalyInfo.multiplier}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Негативных отзывов в {anomalyInfo.multiplier} раз больше нормы
                </span>
              </div>
              {anomalyInfo.startPeriod && (
                <div className="text-sm text-muted-foreground">
                  Период начала аномалии: {anomalyInfo.startPeriod}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Product Diagnosis */}
      {aiDiagnosis && (
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              ИИ-диагноз товара
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Сводка */}
            <div>
              <h4 className="font-semibold mb-2">Сводка проблем</h4>
              <p className="text-sm text-muted-foreground">{aiDiagnosis.summary}</p>
            </div>

            {/* Разбивка по категориям */}
            <div>
              <h4 className="font-semibold mb-3">Разбивка по категориям</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(aiDiagnosis.categories)
                  .filter(([_, data]) => data.count > 0)
                  .map(([category, data]) => (
                    <Card key={category}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">
                          {category === "quality"
                            ? "Качество"
                            : category === "packaging"
                              ? "Упаковка"
                              : category === "logistics"
                                ? "Логистика"
                                : category === "description"
                                  ? "Описание/Фото"
                                  : "Размер/Характеристики"}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold mb-2">{data.count}</div>
                        {data.examples.length > 0 && (
                          <div className="space-y-1 text-xs text-muted-foreground">
                            {data.examples.map((example, idx) => (
                              <div key={idx} className="italic">
                                "{example}..."
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>

            {/* Конкретные действия */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Что сделать сегодня</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {aiDiagnosis.actionsToday.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Что запланировать с поставщиком/производством</CardTitle>
                </CardHeader>
                <CardContent>
                  {aiDiagnosis.actionsPlan.length > 0 ? (
                    <ul className="space-y-2">
                      {aiDiagnosis.actionsPlan.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-1">•</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Нет долгосрочных действий для планирования
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
