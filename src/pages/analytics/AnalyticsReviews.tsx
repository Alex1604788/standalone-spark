import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertTriangle, TrendingDown, Star, Search, Sparkles, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";

interface AnalyticsReviewsProps {
  onNavigateToDiagnostics: (productId: string) => void;
  initialFilter?: "all" | "negative" | "unanswered";
}

interface ReviewMetrics {
  total7Days: number;
  total30Days: number;
  ratingDistribution: { rating: number; count: number }[];
  averageRating: number;
}

interface ProductReviewSummary {
  productId: string;
  productName: string;
  productImage: string | null;
  totalReviews: number;
  averageRating: number;
  negativeCount: number;
  negativeShare: number;
  negativeLastWeek: number;
  isAnomaly: boolean;
  anomalyMultiplier: number | null;
}

interface NegativeReviewCluster {
  theme: string;
  count: number;
  examples: string[];
}

interface NegativeReview {
  id: string;
  text: string;
  advantages: string;
  disadvantages: string;
  rating: number;
  author_name: string;
  review_date: string;
}

interface AIRecommendations {
  summary: string;
  actions: string[];
}

export const AnalyticsReviews = ({ onNavigateToDiagnostics, initialFilter = "all" }: AnalyticsReviewsProps) => {
  const navigate = useNavigate();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filterNegativeOnly, setFilterNegativeOnly] = useState(initialFilter === "negative");
  const [sortBy, setSortBy] = useState<"negativeShare" | "negativeCount">("negativeShare");
  const [searchQuery, setSearchQuery] = useState("");

  // Получаем marketplace_id пользователя
  const { data: marketplace } = useQuery({
    queryKey: ["user-marketplace"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Загружаем общие метрики
  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["reviews-metrics", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return null;

      const now = new Date();
      const date7DaysAgo = subDays(now, 7);
      const date30DaysAgo = subDays(now, 30);

      // Всего отзывов за 7 и 30 дней
      const { data: reviews7Days } = await supabase
        .from("reviews")
        .select("id, rating, products!inner(marketplace_id)", { count: "exact" })
        .in("products.marketplace_id", [marketplace.id])
        .gte("review_date", date7DaysAgo.toISOString());

      const { data: reviews30Days } = await supabase
        .from("reviews")
        .select("id, rating, products!inner(marketplace_id)", { count: "exact" })
        .in("products.marketplace_id", [marketplace.id])
        .gte("review_date", date30DaysAgo.toISOString());

      // Распределение по рейтингам
      const { data: allReviews } = await supabase
        .from("reviews")
        .select("rating, products!inner(marketplace_id)")
        .in("products.marketplace_id", [marketplace.id]);

      const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
        rating,
        count: allReviews?.filter((r) => r.rating === rating).length || 0,
      }));

      const totalRating = allReviews?.reduce((sum, r) => sum + r.rating, 0) || 0;
      const averageRating = allReviews?.length > 0 ? totalRating / allReviews.length : 0;

      return {
        total7Days: reviews7Days?.length || 0,
        total30Days: reviews30Days?.length || 0,
        ratingDistribution,
        averageRating: Math.round(averageRating * 10) / 10,
      } as ReviewMetrics;
    },
    enabled: !!marketplace?.id,
  });

  // Загружаем сводку по товарам
  const { data: productSummaries, isLoading: summariesLoading } = useQuery({
    queryKey: ["product-review-summaries", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const now = new Date();
      const weekAgo = subDays(now, 7);
      const fourWeeksAgo = subDays(now, 28);

      // Получаем все отзывы с товарами
      const { data: reviews } = await supabase
        .from("reviews")
        .select(`
          id,
          product_id,
          rating,
          review_date,
          products!inner(id, name, image_url, marketplace_id)
        `)
        .in("products.marketplace_id", [marketplace.id]);

      if (!reviews) return [];

      // Группируем по товарам
      const productMap = new Map<string, {
        productId: string;
        productName: string;
        productImage: string | null;
        reviews: { rating: number; reviewDate: string }[];
      }>();

      reviews.forEach((review: any) => {
        const productId = review.product_id;
        const product = review.products;

        if (!productMap.has(productId)) {
          productMap.set(productId, {
            productId,
            productName: product.name || "Без названия",
            productImage: product.image_url,
            reviews: [],
          });
        }

        productMap.get(productId)!.reviews.push({
          rating: review.rating,
          reviewDate: review.review_date,
        });
      });

      // Вычисляем метрики для каждого товара
      const summaries: ProductReviewSummary[] = [];

      productMap.forEach((data) => {
        const totalReviews = data.reviews.length;
        const totalRating = data.reviews.reduce((sum, r) => sum + r.rating, 0);
        const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

        const negativeReviews = data.reviews.filter((r) => r.rating <= 3);
        const negativeCount = negativeReviews.length;
        const negativeShare = totalReviews > 0 ? (negativeCount / totalReviews) * 100 : 0;

        const negativeLastWeek = negativeReviews.filter(
          (r) => new Date(r.reviewDate) >= weekAgo
        ).length;

        // Проверка на аномалию (x3 от нормы за последние 4 недели)
        const negativeLast4Weeks = negativeReviews.filter(
          (r) => new Date(r.reviewDate) >= fourWeeksAgo
        ).length;
        const avgNegativePerWeek = negativeLast4Weeks / 4;
        const isAnomaly = avgNegativePerWeek > 0 && negativeLastWeek >= avgNegativePerWeek * 3;
        const anomalyMultiplier = avgNegativePerWeek > 0
          ? Math.round((negativeLastWeek / avgNegativePerWeek) * 10) / 10
          : null;

        summaries.push({
          productId: data.productId,
          productName: data.productName,
          productImage: data.productImage,
          totalReviews,
          averageRating: Math.round(averageRating * 10) / 10,
          negativeCount,
          negativeShare: Math.round(negativeShare * 10) / 10,
          negativeLastWeek,
          isAnomaly,
          anomalyMultiplier,
        });
      });

      return summaries;
    },
    enabled: !!marketplace?.id,
  });

  // Фильтруем и сортируем сводку
  const filteredSummaries = productSummaries
    ?.filter((s) => {
      if (filterNegativeOnly && s.negativeCount === 0) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return s.productName.toLowerCase().includes(query);
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "negativeShare") {
        return b.negativeShare - a.negativeShare;
      }
      return b.negativeCount - a.negativeCount;
    }) || [];

  // Загружаем негативные отзывы для выбранного товара
  const { data: negativeReviewsData, isLoading: negativeLoading } = useQuery({
    queryKey: ["negative-reviews", selectedProductId],
    queryFn: async () => {
      if (!selectedProductId) return null;

      const { data: reviews } = await supabase
        .from("reviews")
        .select("id, text, advantages, disadvantages, rating, author_name, review_date")
        .eq("product_id", selectedProductId)
        .lte("rating", 3)
        .order("review_date", { ascending: false })
        .limit(50);

      if (!reviews || reviews.length === 0) return null;

      // Простая кластеризация по ключевым словам
      const clusters: NegativeReviewCluster[] = [
        { theme: "Качество товара", count: 0, examples: [] },
        { theme: "Упаковка", count: 0, examples: [] },
        { theme: "Доставка", count: 0, examples: [] },
        { theme: "Размер/Характеристики", count: 0, examples: [] },
        { theme: "Описание/Фото", count: 0, examples: [] },
        { theme: "Другое", count: 0, examples: [] },
      ];

      const keywords = {
        "Качество товара": ["качество", "брак", "дефект", "некачественный", "поломка", "сломался"],
        "Упаковка": ["упаковка", "упакован", "поврежден", "коробка", "пленка"],
        "Доставка": ["доставка", "доставили", "курьер", "почта", "транспортировка"],
        "Размер/Характеристики": ["размер", "маленький", "большой", "не подошел", "характеристики"],
        "Описание/Фото": ["фото", "описание", "не соответствует", "не так", "другое"],
      };

      reviews.forEach((review) => {
        const text = `${review.text || ""} ${review.disadvantages || ""}`.toLowerCase();
        let matched = false;

        for (const [theme, words] of Object.entries(keywords)) {
          if (words.some((word) => text.includes(word))) {
            const cluster = clusters.find((c) => c.theme === theme);
            if (cluster) {
              cluster.count++;
              if (cluster.examples.length < 3 && review.text) {
                cluster.examples.push(review.text.substring(0, 100));
              }
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          clusters[clusters.length - 1].count++;
          if (clusters[clusters.length - 1].examples.length < 3 && review.text) {
            clusters[clusters.length - 1].examples.push(review.text.substring(0, 100));
          }
        }
      });

      // Генерируем рекомендации
      const topCluster = clusters
        .filter((c) => c.theme !== "Другое")
        .sort((a, b) => b.count - a.count)[0];

      const recommendations: AIRecommendations = {
        summary: topCluster
          ? `Основная проблема: ${topCluster.theme} (${topCluster.count} упоминаний).`
          : "Негативные отзывы распределены равномерно по разным категориям.",
        actions: topCluster
          ? [
              `Улучшить ${topCluster.theme.toLowerCase()}: проанализировать отзывы и внести изменения.`,
              "Обновить описание товара с учетом частых замечаний.",
              "Связаться с поставщиком для обсуждения улучшений.",
            ]
          : [
              "Провести детальный анализ всех негативных отзывов.",
              "Улучшить общее качество товара и сервиса.",
            ],
      };

      return {
        clusters: clusters.filter((c) => c.count > 0),
        recommendations,
        totalNegative: reviews.length,
        reviews: reviews.map((r) => ({
          id: r.id,
          text: r.text || "",
          advantages: r.advantages || "",
          disadvantages: r.disadvantages || "",
          rating: r.rating,
          author_name: r.author_name || "",
          review_date: r.review_date || "",
        })),
      };
    },
    enabled: !!selectedProductId,
  });

  // Загружаем информацию о выбранном товаре отдельно
  const { data: selectedProductInfo } = useQuery({
    queryKey: ["selected-product-info", selectedProductId],
    queryFn: async () => {
      if (!selectedProductId) return null;
      const { data } = await supabase
        .from("products")
        .select("id, name, image_url")
        .eq("id", selectedProductId)
        .single();
      return data ? { productId: data.id, productName: data.name || "Без названия", productImage: data.image_url } : null;
    },
    enabled: !!selectedProductId,
  });

  const selectedProduct = selectedProductInfo;

  // Автоматическая прокрутка к блоку деталей при выборе товара
  useEffect(() => {
    if (selectedProductId && detailsBlockRef.current) {
      setTimeout(() => {
        detailsBlockRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [selectedProductId]);

  return (
    <div className="space-y-6">
      {/* Общие метрики */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Отзывов за 7 дней</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics?.total7Days || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              За 30 дней: {metrics?.total30Days || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Распределение по рейтингам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {metrics?.ratingDistribution.map((dist) => (
                <div key={dist.rating} className="flex items-center gap-2 text-sm">
                  <div className="flex items-center gap-1 w-12">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    <span>{dist.rating}</span>
                  </div>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full"
                      style={{
                        width: `${metrics.total30Days > 0 ? (dist.count / metrics.total30Days) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8">{dist.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Средний рейтинг магазина</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              {metrics?.averageRating.toFixed(1) || "0.0"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Доля негативных (1-3⭐)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {metrics
                ? (
                    ((metrics.ratingDistribution[0]?.count || 0) +
                      (metrics.ratingDistribution[1]?.count || 0) +
                      (metrics.ratingDistribution[2]?.count || 0)) /
                    metrics.total30Days
                  ).toFixed(1) + "%"
                : "0%"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics
                ? (metrics.ratingDistribution[0]?.count || 0) +
                  (metrics.ratingDistribution[1]?.count || 0) +
                  (metrics.ratingDistribution[2]?.count || 0)
                : 0}{" "}
              отзывов
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Таблица по товарам */}
      <Card>
        <CardHeader>
          <CardTitle>Сводка по товарам (Отзывы)</CardTitle>
          <CardDescription>Анализ отзывов по каждому товару</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Фильтры */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Поиск по товару..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="negativeShare">По доле негативных</SelectItem>
                  <SelectItem value="negativeCount">По количеству негативных</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={filterNegativeOnly ? "default" : "outline"}
                onClick={() => setFilterNegativeOnly(!filterNegativeOnly)}
              >
                Только с негативными
              </Button>
            </div>

            {/* Таблица */}
            {summariesLoading ? (
              <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Товар</TableHead>
                      <TableHead className="text-center">Всего отзывов</TableHead>
                      <TableHead className="text-center">Средний рейтинг</TableHead>
                      <TableHead className="text-center">Негативных (1-3⭐)</TableHead>
                      <TableHead className="text-center">Доля негативных</TableHead>
                      <TableHead className="text-center">Негативных за неделю</TableHead>
                      <TableHead className="text-center">Аномалия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummaries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Нет данных
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredSummaries.map((summary) => (
                        <TableRow
                          key={summary.productId}
                          className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                            selectedProductId === summary.productId ? "bg-muted" : ""
                          }`}
                          onClick={() => {
                            console.log("Клик по товару:", summary.productId, summary.productName);
                            setSelectedProductId(summary.productId);
                          }}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {summary.productImage ? (
                                <img
                                  src={summary.productImage}
                                  alt={summary.productName}
                                  className="w-10 h-10 object-cover rounded"
                                />
                              ) : (
                                <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                  <Star className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium">{summary.productName}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{summary.totalReviews}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              {summary.averageRating}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{summary.negativeCount}</TableCell>
                          <TableCell className="text-center">
                            {summary.negativeCount > 0 ? (
                              <Badge
                                variant={
                                  summary.negativeShare > 20
                                    ? "destructive"
                                    : summary.negativeShare > 10
                                      ? "secondary"
                                      : "outline"
                                }
                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductId(summary.productId);
                                }}
                              >
                                {summary.negativeShare}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0%</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{summary.negativeLastWeek}</TableCell>
                          <TableCell className="text-center">
                            {summary.isAnomaly ? (
                              <Badge variant="destructive" className="gap-1">
                                <TrendingDown className="h-3 w-3" />
                                x{summary.anomalyMultiplier}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Блок негативных отзывов с ИИ-рекомендациями */}
      {selectedProductId && (
        <div ref={detailsBlockRef}>
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Негативные отзывы (1-3⭐) + ИИ-рекомендации
            </CardTitle>
            <CardDescription>
              {selectedProduct?.productName || "Загрузка..."} — анализ причин негативных отзывов
            </CardDescription>
          </CardHeader>
          <CardContent>
            {negativeLoading ? (
              <div className="text-center py-8 text-muted-foreground">Анализ отзывов...</div>
            ) : negativeReviewsData ? (
              <div className="space-y-6">
                {/* Список негативных отзывов */}
                <div>
                  <h3 className="font-semibold mb-3">
                    Список негативных отзывов ({negativeReviewsData.totalNegative})
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {negativeReviewsData.reviews?.map((review) => (
                      <Card key={review.id} className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive">⭐ {review.rating}</Badge>
                              <span className="text-sm font-medium">{review.author_name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(review.review_date).toLocaleDateString("ru-RU")}
                            </span>
                          </div>
                          {review.text && (
                            <p className="text-sm">{review.text}</p>
                          )}
                          {review.advantages && (
                            <div>
                              <span className="text-xs font-medium text-green-600">Плюсы: </span>
                              <span className="text-sm">{review.advantages}</span>
                            </div>
                          )}
                          {review.disadvantages && (
                            <div>
                              <span className="text-xs font-medium text-red-600">Минусы: </span>
                              <span className="text-sm">{review.disadvantages}</span>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Кластеризация причин */}
                <div>
                  <h3 className="font-semibold mb-3">Причины негативных отзывов</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {negativeReviewsData.clusters.map((cluster) => (
                      <Card key={cluster.theme}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">{cluster.theme}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold mb-2">{cluster.count}</div>
                          {cluster.examples.length > 0 && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {cluster.examples.map((example, idx) => (
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

                {/* ИИ-рекомендации */}
                <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      ИИ-рекомендации
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Краткая сводка</h4>
                      <p className="text-sm text-muted-foreground">
                        {negativeReviewsData.recommendations.summary}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Рекомендуемые действия</h4>
                      <ul className="space-y-2">
                        {negativeReviewsData.recommendations.actions.map((action, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <span className="text-primary mt-1">•</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onNavigateToDiagnostics(selectedProductId)}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Полная диагностика товара
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedProductId(null)}>
                    Скрыть
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Нет негативных отзывов для этого товара
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
