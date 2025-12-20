import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { HelpCircle, Clock, Search, Sparkles, ExternalLink, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { subDays, differenceInMinutes } from "date-fns";

interface AnalyticsQuestionsProps {
  onNavigateToDiagnostics: (productId: string) => void;
  initialFilter?: "all" | "unanswered";
}

interface QuestionMetrics {
  total7Days: number;
  total30Days: number;
  unansweredCount: number;
  avgResponseTime: number; // в минутах
  topProducts: { productId: string; productName: string; count: number }[];
}

interface ProductQuestionSummary {
  productId: string;
  productName: string;
  productImage: string | null;
  questionCount: number;
  percentOfTotal: number;
  unansweredCount: number;
  avgResponseTime: number; // в минутах
  topThemes: string[];
}

interface QuestionTheme {
  theme: string;
  count: number;
  examples: string[];
}

interface AIRecommendations {
  summary: string;
  actions: string[];
}

export const AnalyticsQuestions = ({ onNavigateToDiagnostics, initialFilter = "all" }: AnalyticsQuestionsProps) => {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUnansweredOnly, setShowUnansweredOnly] = useState(initialFilter === "unanswered");
  const detailsBlockRef = useRef<HTMLDivElement>(null);

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
    queryKey: ["questions-metrics", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return null;

      const now = new Date();
      const date7DaysAgo = subDays(now, 7);
      const date30DaysAgo = subDays(now, 30);

      // Всего вопросов за 7 и 30 дней
      const { data: questions7Days } = await supabase
        .from("questions")
        .select("id, products!inner(marketplace_id)", { count: "exact" })
        .in("products.marketplace_id", [marketplace.id])
        .gte("question_date", date7DaysAgo.toISOString());

      const { data: questions30Days } = await supabase
        .from("questions")
        .select("id, products!inner(marketplace_id)", { count: "exact" })
        .in("products.marketplace_id", [marketplace.id])
        .gte("question_date", date30DaysAgo.toISOString());

      // Неотвеченные вопросы
      const { data: unansweredQuestions } = await supabase
        .from("questions")
        .select("id, products!inner(marketplace_id)", { count: "exact" })
        .in("products.marketplace_id", [marketplace.id])
        .eq("is_answered", false);

      // Среднее время ответа (из replies)
      const { data: replies } = await supabase
        .from("replies")
        .select(`
          created_at,
          published_at,
          question_id,
          questions!inner(
            product_id,
            products!inner(marketplace_id)
          )
        `)
        .in("questions.products.marketplace_id", [marketplace.id])
        .not("published_at", "is", null);

      let totalResponseTime = 0;
      let responseCount = 0;

      replies?.forEach((reply: any) => {
        if (reply.published_at && reply.created_at) {
          const created = new Date(reply.created_at);
          const published = new Date(reply.published_at);
          const minutes = differenceInMinutes(published, created);
          if (minutes > 0) {
            totalResponseTime += minutes;
            responseCount++;
          }
        }
      });

      const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

      // Топ товаров по количеству вопросов
      const { data: allQuestions } = await supabase
        .from("questions")
        .select(`
          product_id,
          products!inner(id, name, marketplace_id)
        `)
        .in("products.marketplace_id", [marketplace.id]);

      const productCountMap = new Map<string, { productId: string; productName: string; count: number }>();

      allQuestions?.forEach((q: any) => {
        const productId = q.product_id;
        const product = q.products;
        if (!productCountMap.has(productId)) {
          productCountMap.set(productId, {
            productId,
            productName: product.name || "Без названия",
            count: 0,
          });
        }
        productCountMap.get(productId)!.count++;
      });

      const topProducts = Array.from(productCountMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total7Days: questions7Days?.length || 0,
        total30Days: questions30Days?.length || 0,
        unansweredCount: unansweredQuestions?.length || 0,
        avgResponseTime: Math.round(avgResponseTime),
        topProducts,
      } as QuestionMetrics;
    },
    enabled: !!marketplace?.id,
  });

  // Загружаем сводку по товарам
  const { data: productSummaries, isLoading: summariesLoading } = useQuery({
    queryKey: ["product-question-summaries", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      // Получаем все вопросы с товарами
      const { data: questions } = await supabase
        .from("questions")
        .select(`
          id,
          product_id,
          text,
          question_date,
          is_answered,
          products!inner(id, name, image_url, marketplace_id)
        `)
        .in("products.marketplace_id", [marketplace.id]);

      if (!questions) return [];

      // Получаем все ответы для расчета времени ответа
      const { data: replies } = await supabase
        .from("replies")
        .select(`
          created_at,
          published_at,
          question_id
        `)
        .not("published_at", "is", null);

      const replyMap = new Map<string, { created: Date; published: Date }>();
      replies?.forEach((reply: any) => {
        if (reply.published_at && reply.created_at) {
          replyMap.set(reply.question_id, {
            created: new Date(reply.created_at),
            published: new Date(reply.published_at),
          });
        }
      });

      // Группируем по товарам
      const productMap = new Map<string, {
        productId: string;
        productName: string;
        productImage: string | null;
        questions: { text: string; isAnswered: boolean; questionId: string }[];
        responseTimes: number[];
      }>();

      questions.forEach((q: any) => {
        const productId = q.product_id;
        const product = q.products;

        if (!productMap.has(productId)) {
          productMap.set(productId, {
            productId,
            productName: product.name || "Без названия",
            productImage: product.image_url,
            questions: [],
            responseTimes: [],
          });
        }

        productMap.get(productId)!.questions.push({
          text: q.text || "",
          isAnswered: q.is_answered,
          questionId: q.id,
        });

        // Добавляем время ответа, если есть
        const reply = replyMap.get(q.id);
        if (reply) {
          const minutes = differenceInMinutes(reply.published, reply.created);
          if (minutes > 0) {
            productMap.get(productId)!.responseTimes.push(minutes);
          }
        }
      });

      const totalQuestions = questions.length;

      // Вычисляем метрики для каждого товара
      const summaries: ProductQuestionSummary[] = [];

      productMap.forEach((data) => {
        const questionCount = data.questions.length;
        const percentOfTotal = totalQuestions > 0 ? (questionCount / totalQuestions) * 100 : 0;
        const unansweredCount = data.questions.filter((q) => !q.isAnswered).length;
        const avgResponseTime = data.responseTimes.length > 0
          ? data.responseTimes.reduce((sum, t) => sum + t, 0) / data.responseTimes.length
          : 0;

        // Определяем основные темы вопросов
        const themes: { [key: string]: number } = {
          "Размеры": 0,
          "Характеристики": 0,
          "Совместимость": 0,
          "Доставка": 0,
          "Другое": 0,
        };

        const keywords = {
          "Размеры": ["размер", "размеры", "большой", "маленький", "подойдет", "рост", "вес"],
          "Характеристики": ["характеристики", "параметры", "материал", "цвет", "вес", "объем"],
          "Совместимость": ["совместим", "подходит", "работает", "можно", "совместно"],
          "Доставка": ["доставка", "доставили", "курьер", "почта", "срок"],
        };

        data.questions.forEach((q) => {
          const text = q.text.toLowerCase();
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

        const topThemes = Object.entries(themes)
          .filter(([_, count]) => count > 0)
          .sort(([_, a], [__, b]) => b - a)
          .slice(0, 3)
          .map(([theme]) => theme);

        summaries.push({
          productId: data.productId,
          productName: data.productName,
          productImage: data.productImage,
          questionCount,
          percentOfTotal: Math.round(percentOfTotal * 10) / 10,
          unansweredCount,
          avgResponseTime: Math.round(avgResponseTime),
          topThemes,
        });
      });

      return summaries;
    },
    enabled: !!marketplace?.id,
  });

  // Фильтруем сводку
  const filteredSummaries = productSummaries
    ?.filter((s) => {
      if (showUnansweredOnly && s.unansweredCount === 0) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return s.productName.toLowerCase().includes(query);
      }
      return true;
    })
    .sort((a, b) => b.questionCount - a.questionCount) || [];

  // Загружаем вопросы для выбранного товара
  const { data: questionAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ["question-analysis", selectedProductId],
    queryFn: async () => {
      if (!selectedProductId) return null;

      const { data: questions } = await supabase
        .from("questions")
        .select("id, text, author_name, question_date, is_answered")
        .eq("product_id", selectedProductId)
        .order("question_date", { ascending: false })
        .limit(50);

      if (!questions || questions.length === 0) return null;

      // Кластеризация по темам
      const themes: QuestionTheme[] = [
        { theme: "Размеры", count: 0, examples: [] },
        { theme: "Характеристики", count: 0, examples: [] },
        { theme: "Совместимость", count: 0, examples: [] },
        { theme: "Доставка", count: 0, examples: [] },
        { theme: "Другое", count: 0, examples: [] },
      ];

      const keywords = {
        "Размеры": ["размер", "размеры", "большой", "маленький", "подойдет", "рост", "вес"],
        "Характеристики": ["характеристики", "параметры", "материал", "цвет", "вес", "объем"],
        "Совместимость": ["совместим", "подходит", "работает", "можно", "совместно"],
        "Доставка": ["доставка", "доставили", "курьер", "почта", "срок"],
      };

      questions.forEach((q) => {
        const text = (q.text || "").toLowerCase();
        let matched = false;

        for (const [theme, words] of Object.entries(keywords)) {
          if (words.some((word) => text.includes(word))) {
            const cluster = themes.find((t) => t.theme === theme);
            if (cluster) {
              cluster.count++;
              if (cluster.examples.length < 3 && q.text) {
                cluster.examples.push(q.text.substring(0, 100));
              }
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          themes[themes.length - 1].count++;
          if (themes[themes.length - 1].examples.length < 3 && q.text) {
            themes[themes.length - 1].examples.push(q.text.substring(0, 100));
          }
        }
      });

      // Генерируем рекомендации
      const topTheme = themes
        .filter((t) => t.theme !== "Другое")
        .sort((a, b) => b.count - a.count)[0];

      const recommendations: AIRecommendations = {
        summary: topTheme
          ? `Основная тема вопросов: ${topTheme.theme} (${topTheme.count} упоминаний).`
          : "Вопросы распределены равномерно по разным темам.",
        actions: topTheme
          ? [
              `Улучшить описание ${topTheme.theme.toLowerCase()}: добавить подробную информацию в карточку товара.`,
              "Добавить фотографии, демонстрирующие ключевые характеристики.",
              "Обновить характеристики товара с учетом частых вопросов.",
            ]
          : [
              "Провести анализ всех вопросов для выявления общих тем.",
              "Улучшить общее описание товара и добавить больше деталей.",
            ],
      };

      return {
        themes: themes.filter((t) => t.count > 0),
        recommendations,
        totalQuestions: questions.length,
        unansweredQuestions: questions.filter((q) => !q.is_answered).map((q) => ({
          id: q.id,
          text: q.text || "",
          author_name: q.author_name || "",
          question_date: q.question_date || "",
        })),
        allQuestions: questions.map((q) => ({
          id: q.id,
          text: q.text || "",
          author_name: q.author_name || "",
          question_date: q.question_date || "",
          is_answered: q.is_answered || false,
        })),
      };
    },
    enabled: !!selectedProductId,
  });

  // Загружаем информацию о выбранном товаре отдельно
  const { data: selectedProductInfo } = useQuery({
    queryKey: ["selected-product-info-questions", selectedProductId],
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
            <CardTitle className="text-sm font-medium">Вопросов за 7 дней</CardTitle>
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
            <CardTitle className="text-sm font-medium">Неотвеченных вопросов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{metrics?.unansweredCount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Среднее время ответа</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              {metrics?.avgResponseTime
                ? metrics.avgResponseTime < 60
                  ? `${metrics.avgResponseTime} мин`
                  : `${Math.round(metrics.avgResponseTime / 60)} ч`
                : "—"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Топ товаров по вопросам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics?.topProducts.slice(0, 3).map((product, idx) => (
                <div key={product.productId} className="flex items-center justify-between text-sm">
                  <span className="truncate flex-1">{product.productName}</span>
                  <Badge variant="secondary">{product.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Таблица по товарам */}
      {!selectedProductId && (
        <Card>
          <CardHeader>
            <CardTitle>Сводка по товарам (Вопросы)</CardTitle>
            <CardDescription>Анализ вопросов по каждому товару</CardDescription>
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
                      <TableHead className="text-center">Количество вопросов</TableHead>
                      <TableHead className="text-center">% от общего</TableHead>
                      <TableHead className="text-center">Неотвеченных</TableHead>
                      <TableHead className="text-center">Среднее время ответа</TableHead>
                      <TableHead className="text-center">Основные темы</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummaries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
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
                                  <HelpCircle className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium">{summary.productName}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{summary.questionCount}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline">{summary.percentOfTotal}%</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {summary.unansweredCount > 0 ? (
                              <Badge variant="destructive">{summary.unansweredCount}</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {summary.avgResponseTime > 0 ? (
                              <div className="flex items-center justify-center gap-1 text-sm">
                                <Clock className="h-3 w-3" />
                                {summary.avgResponseTime < 60
                                  ? `${summary.avgResponseTime} мин`
                                  : `${Math.round(summary.avgResponseTime / 60)} ч`}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {summary.topThemes.map((theme) => (
                                <Badge key={theme} variant="secondary" className="text-xs">
                                  {theme}
                                </Badge>
                              ))}
                            </div>
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

      {/* Блок анализа тем вопросов с ИИ-рекомендациями */}
      {selectedProductId && (
        <div ref={detailsBlockRef}>
          <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Анализ тем вопросов + ИИ-рекомендации
            </CardTitle>
            <CardDescription>
              {selectedProduct?.productName || "Загрузка..."} — анализ вопросов и рекомендации по улучшению карточки
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analysisLoading ? (
              <div className="text-center py-8 text-muted-foreground">Анализ вопросов...</div>
            ) : questionAnalysis ? (
              <div className="space-y-6">
                {/* Список неотвеченных вопросов */}
                {questionAnalysis.unansweredQuestions && questionAnalysis.unansweredQuestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">
                      Неотвеченные вопросы ({questionAnalysis.unansweredQuestions.length})
                    </h3>
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {questionAnalysis.unansweredQuestions.map((question) => (
                        <Card key={question.id} className="p-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="destructive">Не отвечено</Badge>
                                <span className="text-sm font-medium">{question.author_name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(question.question_date).toLocaleDateString("ru-RU")}
                              </span>
                            </div>
                            <p className="text-sm">{question.text}</p>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Кластеризация тем */}
                <div>
                  <h3 className="font-semibold mb-3">Темы вопросов</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {questionAnalysis.themes.map((theme) => (
                      <Card key={theme.theme}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">{theme.theme}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold mb-2">{theme.count}</div>
                          {theme.examples.length > 0 && (
                            <div className="space-y-1 text-xs text-muted-foreground">
                              {theme.examples.map((example, idx) => (
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
                        {questionAnalysis.recommendations.summary}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Рекомендуемые действия</h4>
                      <ul className="space-y-2">
                        {questionAnalysis.recommendations.actions.map((action, idx) => (
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
                Нет вопросов для этого товара
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      )}
    </div>
  );
};
