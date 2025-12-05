import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Star, MessageSquare, Calendar, Sparkles, Image as ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Reply {
  id: string;
  content: string;
  status: string;
  mode: string;
  scheduled_at: string | null;
  tone: string;
}

interface Review {
  id: string;
  external_id: string;
  author_name: string;
  text: string | null;
  advantages: string | null;
  disadvantages: string | null;
  review_date: string;
  rating: number;
  is_answered: boolean;
  product_id: string;
  photos: any; // JSONB from database
  products: {
    name: string;
  };
  replies?: Reply[];
}

interface Question {
  id: string;
  external_id: string;
  author_name: string;
  text: string;
  question_date: string;
  is_answered: boolean;
  product_id: string;
  products: {
    name: string;
  };
  replies?: Reply[];
}

const Reviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedItem, setSelectedItem] = useState<Review | Question | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyTone, setReplyTone] = useState("friendly");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchReviews();
    fetchQuestions();
  }, []);
const fetchReviews = async () => {
  setIsTableLoading(true);

  try {
    // 1. Текущий пользователь
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setReviews([]);
      return;
    }

    // 2. Его маркетплейсы
    const { data: marketplaces, error: mpErr } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);

    if (mpErr || !marketplaces || marketplaces.length === 0) {
      setReviews([]);
      return;
    }
    const marketplaceIds = marketplaces.map((m) => m.id);

    // 3. Базовый запрос по отзывам
    let query = supabase
      .from("reviews")
      .select(
        `*,
         products!inner(name, offer_id, marketplace_id),
         replies(id, content, status, created_at, tone)`,
        { count: "exact" },
      )
      .in("products.marketplace_id", marketplaceIds);

    // 4. Фильтр по оценке
    if (ratingFilter !== "all") {
      query = query.eq("rating", parseInt(ratingFilter, 10));
    }

    // 5. Фильтр по статусу
    if (statusFilter === "answered") {
      query = query.eq("is_answered", true);
    } else if (statusFilter === "unanswered") {
      query = query.eq("is_answered", false);
    }

    // 6. Поиск (ЗДЕСЬ БЫЛА ОШИБКА 400)
    if (searchQuery) {
      // чистим строку от символов, которые ломают логическое выражение PostgREST
      const term = searchQuery.trim();
      const safeTerm = term.replace(/[^a-zA-Zа-яА-Я0-9ёЁ\s]/g, " ");

      query = query.or(
        `text.ilike.*${safeTerm}*,products.name.ilike.*${safeTerm}*`,
      );
    }

    // 7. Пагинация
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("review_date", { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    setTotalReviews(count || 0);
    setReviews((data || []) as ReviewWithDetails[]);
  } catch (error) {
    console.error("Fetch error:", error);
    toast({
      title: "Ошибка",
      description: "Не удалось загрузить отзывы",
      variant: "destructive",
    });
  } finally {
    setIsTableLoading(false);
  }
};

    const productIds = products.map((p) => p.id);
    const nameById: Record<string, string> = Object.fromEntries(products.map((p) => [p.id, p.name]));

    // 4. Отзывы только по product_id (без join)
    const { data, error } = await supabase
      .from("reviews")
      .select(
        "id, external_id, author_name, text, advantages, disadvantages, review_date, rating, is_answered, product_id, photos",
      )
      .in("product_id", productIds)
      .order("review_date", { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: "Ошибка", description: "Не удалось загрузить отзывы", variant: "destructive" });
      setReviews([]);
      return;
    }

    // 5. Подкладываем имя товара
    const withNames = (data || []).map((r) => ({
      ...r,
      products: { name: nameById[r.product_id] || "—" },
    }));

    setReviews(withNames);
  };
  /*
  const fetchQuestions = async () => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user's marketplaces
    const { data: marketplaces } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);
    
    if (!marketplaces || marketplaces.length === 0) return;
    
    const marketplaceIds = marketplaces.map(m => m.id);

    const { data, error } = await supabase
      .from("questions")
      .select(`
        *, 
        products!inner(name, marketplace_id),
        replies(id, content, status, mode, scheduled_at, tone)
      `)
      .in("products.marketplace_id", marketplaceIds)
      .order("question_date", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить вопросы",
        variant: "destructive",
      });
    } else {
      setQuestions(data || []);
    }
  };
*/
  const fetchQuestions = async () => {
    // 1. Текущий пользователь
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 2. Его маркетплейсы
    const { data: marketplaces, error: mpErr } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);

    if (mpErr || !marketplaces || marketplaces.length === 0) {
      setQuestions([]);
      return;
    }
    const marketplaceIds = marketplaces.map((m) => m.id);

    // 3. Товары этих маркетплейсов
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name")
      .in("marketplace_id", marketplaceIds);

    if (pErr || !products || products.length === 0) {
      setQuestions([]);
      return;
    }

    const productIds = products.map((p) => p.id);
    const nameById: Record<string, string> = Object.fromEntries(products.map((p) => [p.id, p.name]));

    // 4. Вопросы только по product_id (без join)
    const { data, error } = await supabase
      .from("questions")
      .select("id, external_id, author_name, text, question_date, is_answered, product_id")
      .in("product_id", productIds)
      .order("question_date", { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: "Ошибка", description: "Не удалось загрузить вопросы", variant: "destructive" });
      setQuestions([]);
      return;
    }

    // 5. Подкладываем имя товара
    const withNames = (data || []).map((q) => ({
      ...q,
      products: { name: nameById[q.product_id] || "—" },
    }));

    setQuestions(withNames);
  };
  const handleReply = async () => {
    if (!selectedItem || !replyText.trim()) return;

    if (scheduleMode === "later" && !scheduledDateTime) {
      toast({
        title: "Ошибка",
        description: "Укажите дату и время отправки",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const isReview = "rating" in selectedItem;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast({
        title: "Ошибка",
        description: "Пользователь не авторизован",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const replyData: any = {
      content: replyText,
      tone: replyTone,
      mode: "manual",
      user_id: user.id,
    };

    if (scheduleMode === "now") {
      replyData.status = "scheduled";
      replyData.scheduled_at = new Date().toISOString();
      replyData.can_cancel_until = new Date(Date.now() + 60000).toISOString();
    } else {
      replyData.status = "scheduled";
      replyData.scheduled_at = new Date(scheduledDateTime).toISOString();
      replyData.can_cancel_until = new Date(scheduledDateTime).toISOString();
    }

    // Check if drafted reply exists
    const existingReply = selectedItem.replies?.find((r) => r.status === "drafted");

    let error;
    if (existingReply) {
      // Update existing drafted reply
      ({ error } = await supabase.from("replies").update(replyData).eq("id", existingReply.id));
    } else {
      // Create new reply
      replyData[isReview ? "review_id" : "question_id"] = selectedItem.id;
      ({ error } = await supabase.from("replies").insert(replyData));
    }

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось запланировать ответ",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: scheduleMode === "now" ? "Ответ будет отправлен в ближайшую минуту" : "Ответ запланирован",
      });
      setSelectedItem(null);
      setReplyText("");
      setReplyTone("friendly");
      setScheduleMode("now");
      setScheduledDateTime("");
      isReview ? fetchReviews() : fetchQuestions();
    }
    setIsLoading(false);
  };

  const handleGenerateReply = async () => {
    if (!selectedItem) return;

    setIsGenerating(true);
    const isReview = "rating" in selectedItem;

    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          [isReview ? "reviewId" : "questionId"]: selectedItem.id,
          tone: replyTone,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast({
          title: "Ошибка",
          description: data.error,
          variant: "destructive",
        });
      } else {
        setReplyText(data.reply);
        toast({
          title: "Готово",
          description: "Ответ сгенерирован с помощью AI",
        });
      }
    } catch (error: any) {
      console.error("Error generating reply:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сгенерировать ответ",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch =
      review.author_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      review.products.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRating = ratingFilter === "all" || review.rating.toString() === ratingFilter;
    const matchesStatus =
      statusFilter === "all" || (statusFilter === "answered" ? review.is_answered : !review.is_answered);
    return matchesSearch && matchesRating && matchesStatus;
  });

  const filteredQuestions = questions.filter((question) => {
    const matchesSearch =
      question.author_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      question.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      question.products.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || (statusFilter === "answered" ? question.is_answered : !question.is_answered);
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">Отзывы</h1>
          <p className="text-muted-foreground">Просматривайте и отвечайте на отзывы и вопросы покупателей</p>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по автору, тексту или товару..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[200px]">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="answered">С ответом</SelectItem>
              <SelectItem value="unanswered">Без ответа</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="reviews" className="space-y-6">
         
          <TabsContent value="reviews" className="space-y-4">
            <div className="flex gap-4 mb-4">
              <Select value={ratingFilter} onValueChange={setRatingFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Рейтинг" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все рейтинги</SelectItem>
                  <SelectItem value="5">5 звёзд</SelectItem>
                  <SelectItem value="4">4 звезды</SelectItem>
                  <SelectItem value="3">3 звезды</SelectItem>
                  <SelectItem value="2">2 звезды</SelectItem>
                  <SelectItem value="1">1 звезда</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredReviews.length === 0 ? (
              <Card className="p-12 text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">Нет отзывов</h3>
                <p className="text-muted-foreground">Подключите маркетплейсы, чтобы начать получать отзывы</p>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Товар</TableHead>
                      <TableHead>Оценка</TableHead>
                      <TableHead className="max-w-md">Текст отзыва</TableHead>
                      <TableHead>Статус ответа</TableHead>
                      <TableHead className="text-center">Фото</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReviews.map((review) => (
                      <TableRow key={review.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(review.review_date), "d MMM yyyy", { locale: ru })}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{review.products.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"
                                }`}
                              />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="space-y-1">
                            {review.text && <p className="text-sm line-clamp-2">{review.text}</p>}
                            {review.advantages && (
                              <p className="text-xs text-green-600 line-clamp-1">
                                <span className="font-medium">+</span> {review.advantages}
                              </p>
                            )}
                            {review.disadvantages && (
                              <p className="text-xs text-red-600 line-clamp-1">
                                <span className="font-medium">−</span> {review.disadvantages}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {review.is_answered ? (
                            <Badge variant="secondary">Отвечено</Badge>
                          ) : review.replies && review.replies.length > 0 && review.replies[0].status === "drafted" ? (
                            <Badge variant="outline" className="text-primary border-primary">
                              Черновик
                            </Badge>
                          ) : (
                            <Badge variant="outline">Без ответа</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {review.photos && Array.isArray(review.photos) && review.photos.length > 0 && (
                            <div className="flex items-center justify-center gap-1">
                              <ImageIcon className="h-4 w-4 text-primary" />
                              <span className="text-sm">{review.photos.length}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(review);
                              if (
                                review.replies &&
                                review.replies.length > 0 &&
                                review.replies[0].status === "drafted"
                              ) {
                                setReplyText(review.replies[0].content);
                                setReplyTone(review.replies[0].tone);
                              } else {
                                setReplyText("");
                              }
                            }}
                          >
                            Открыть
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="questions" className="space-y-4">
            {filteredQuestions.length === 0 ? (
              <Card className="p-12 text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-xl font-semibold mb-2">Нет вопросов</h3>
                <p className="text-muted-foreground">Подключите маркетплейсы, чтобы начать получать вопросы</p>
              </Card>
            ) : (
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Товар</TableHead>
                      <TableHead className="max-w-md">Текст вопроса</TableHead>
                      <TableHead>Статус ответа</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuestions.map((question) => (
                      <TableRow key={question.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(question.question_date), "d MMM yyyy", { locale: ru })}
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{question.products.name}</TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-sm line-clamp-3">{question.text}</p>
                        </TableCell>
                        <TableCell>
                          {question.is_answered ? (
                            <Badge variant="secondary">Отвечено</Badge>
                          ) : question.replies &&
                            question.replies.length > 0 &&
                            question.replies[0].status === "drafted" ? (
                            <Badge variant="outline" className="text-primary border-primary">
                              Черновик
                            </Badge>
                          ) : (
                            <Badge variant="outline">Без ответа</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(question);
                              if (
                                question.replies &&
                                question.replies.length > 0 &&
                                question.replies[0].status === "drafted"
                              ) {
                                setReplyText(question.replies[0].content);
                                setReplyTone(question.replies[0].tone);
                              } else {
                                setReplyText("");
                              }
                            }}
                          >
                            Открыть
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedItem && "rating" in selectedItem ? "Ответить на отзыв" : "Ответить на вопрос"}
              </DialogTitle>
              <DialogDescription>Проверьте и отредактируйте ответ перед отправкой</DialogDescription>
            </DialogHeader>

            <div className="grid md:grid-cols-2 gap-6 overflow-y-auto flex-1">
              {/* Left: Original review/question */}
              <div className="space-y-4">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  {selectedItem && "rating" in selectedItem ? "Отзыв покупателя" : "Вопрос покупателя"}
                </h3>
                {selectedItem && (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3 border border-border">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{selectedItem.author_name}</p>
                        <p className="text-sm text-muted-foreground">{selectedItem.products.name}</p>
                      </div>
                      {"rating" in selectedItem && (
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < selectedItem.rating ? "fill-yellow-400 text-yellow-400" : "text-muted"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed">{selectedItem.text}</p>
                    {"advantages" in selectedItem && selectedItem.advantages && (
                      <div className="text-sm pt-2 border-t border-border">
                        <span className="font-medium text-green-600">Достоинства: </span>
                        <span className="text-muted-foreground">{selectedItem.advantages}</span>
                      </div>
                    )}
                    {"disadvantages" in selectedItem && selectedItem.disadvantages && (
                      <div className="text-sm">
                        <span className="font-medium text-red-600">Недостатки: </span>
                        <span className="text-muted-foreground">{selectedItem.disadvantages}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Reply editor */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Ваш ответ</h3>
                  <Button variant="outline" size="sm" onClick={handleGenerateReply} disabled={isGenerating}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {isGenerating ? "Генерация..." : "Сгенерировать AI"}
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Тон ответа</Label>
                    <Select value={replyTone} onValueChange={setReplyTone}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Дружелюбный</SelectItem>
                        <SelectItem value="formal">Формальный</SelectItem>
                        <SelectItem value="professional">Профессиональный</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Текст ответа</Label>
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Введите ваш ответ..."
                      rows={8}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Когда отправить</Label>
                    <Select value={scheduleMode} onValueChange={(v: "now" | "later") => setScheduleMode(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Отправить сейчас</SelectItem>
                        <SelectItem value="later">Запланировать</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {scheduleMode === "later" && (
                    <div className="space-y-2">
                      <Label>Дата и время</Label>
                      <Input
                        type="datetime-local"
                        value={scheduledDateTime}
                        onChange={(e) => setScheduledDateTime(e.target.value)}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 mt-4">
              <Button variant="outline" onClick={() => setSelectedItem(null)}>
                Отмена
              </Button>
              <Button onClick={handleReply} disabled={isLoading || !replyText.trim()}>
                {scheduleMode === "now" ? "Отправить сейчас" : "Запланировать"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Reviews;
