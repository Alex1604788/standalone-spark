import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles, Search, Send, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ReviewsTable } from "@/components/reviews/ReviewsTable";
import { ReviewWithDetails, getProductName, getProductArticle } from "@/lib/reviewHelpers";
import { getReviewSegment, getReviewStatusBadge } from "@/lib/reviewStatusHelpers";
import { HelpIcon } from "@/components/HelpIcon";

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
    marketplace_id?: string;
  };
  replies?: any[];
}

const Reviews = () => {
  const { status } = useParams<{ status: string }>();
  const [reviews, setReviews] = useState<ReviewWithDetails[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalReviews, setTotalReviews] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const statusFilter = status || "unanswered";

  const [selectedItem, setSelectedItem] = useState<ReviewWithDetails | Question | null>(null);
  const [selectedReviewsIds, setSelectedReviewsIds] = useState<string[]>([]);

  const [replyText, setReplyText] = useState("");
  const [replyTone, setReplyTone] = useState("friendly");
  const [responseLength, setResponseLength] = useState<"short" | "normal">("short");
  const [replyMethod, setReplyMethod] = useState<"template" | "ai">("template");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);

  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledDateTime, setScheduledDateTime] = useState("");
  const [existingDraftId, setExistingDraftId] = useState<string | null>(null);
  
  // ✅ Статус процесса автоматической отправки
  const [scheduledCount, setScheduledCount] = useState(0);
  const [publishingCount, setPublishingCount] = useState(0);
  const [lastGenerationTime, setLastGenerationTime] = useState<Date | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    setPage(1);
    setSelectedReviewsIds([]);
  }, [searchQuery, ratingFilter, statusFilter, pageSize]);

  // Автоматическая генерация черновиков в режиме полуавтомат/автомат
  const triggerAutoGenerate = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsGenerating(false);
        return;
      }

      // Получаем маркетплейсы пользователя
      const { data: marketplaces } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id);

      if (!marketplaces?.length) {
        toast({
          title: "Ошибка",
          description: "Не найдено маркетплейсов",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }

      console.log("[Reviews] Triggering auto-generate drafts for", marketplaces.length, "marketplaces");
      
      toast({
        title: "Запуск генерации...",
        description: "Создаём ответы на неотвеченные отзывы согласно настройкам",
      });

      let totalGenerated = 0;
      let totalScheduled = 0;
      let totalDrafted = 0;

      // Запускаем генерацию для каждого маркетплейса
      for (const mp of marketplaces) {
        console.log("[Reviews] Calling auto-generate-drafts for marketplace:", mp.id);
        
        const { data, error } = await supabase.functions.invoke("auto-generate-drafts", {
          body: { 
            user_id: user.id, 
            marketplace_id: mp.id,
            response_length: responseLength
          }
        });

        if (error) {
          console.error("[Reviews] Auto-generate error:", error);
        } else {
          console.log("[Reviews] Auto-generate result:", data);
          const reviewsData = data?.reviews || {};
          totalGenerated += (reviewsData.drafts_created || 0) + (reviewsData.scheduled || 0);
          totalScheduled += reviewsData.scheduled || 0;
          totalDrafted += reviewsData.drafts_created || 0;
        }
      }
      
      // Обновляем список после генерации
      fetchReviews();
      window.dispatchEvent(new Event("reviews-updated"));
      
      // ✅ Обновляем статус процесса
      if (totalScheduled > 0) {
        setLastGenerationTime(new Date());
      }
      await updatePublishingStatus();

      // Показываем результат
      const messages = [];
      if (totalScheduled > 0) messages.push(`${totalScheduled} отправлено в очередь`);
      if (totalDrafted > 0) messages.push(`${totalDrafted} создано черновиков`);
      
      toast({
        title: totalGenerated > 0 ? "Генерация завершена" : "Нет новых отзывов",
        description: totalGenerated > 0 
          ? messages.join(", ") 
          : "Все отзывы уже обработаны или нет неотвеченных отзывов",
      });
    } catch (e) {
      console.error("[Reviews] Auto-generate error:", e);
      toast({
        title: "Ошибка",
        description: "Не удалось запустить генерацию",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // ✅ Функция для обновления статуса процесса отправки
  const updatePublishingStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: marketplaces } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);

    if (!marketplaces || marketplaces.length === 0) return;
    const marketplaceIds = marketplaces.map((m) => m.id);

    // Подсчитываем scheduled ответы
    const { count: scheduled } = await supabase
      .from("replies")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("status", "scheduled")
      .is("deleted_at", null);

    // Подсчитываем publishing ответы
    const { count: publishing } = await supabase
      .from("replies")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("status", "publishing")
      .is("deleted_at", null);

    setScheduledCount(scheduled || 0);
    setPublishingCount(publishing || 0);
  };

  useEffect(() => {
    fetchReviews();
    fetchQuestions();
    updatePublishingStatus();
    
    // ✅ Генерация теперь работает в фоновом режиме через cron job
    // Автогенерация при открытии страницы отключена
    // Пользователь может запустить генерацию вручную через кнопку "Автогенерация ответов"
  }, [page, pageSize, ratingFilter, statusFilter]);

  // ✅ Отдельный useEffect для real-time подписки и периодического обновления статуса
  useEffect(() => {
    updatePublishingStatus();
    
    // ✅ Real-time подписка на изменения в replies для отслеживания статуса отправки
    const repliesChannel = supabase
      .channel("replies-status-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "replies",
        },
        () => {
          updatePublishingStatus();
        }
      )
      .subscribe();

    // Обновляем статус каждые 10 секунд
    const interval = setInterval(updatePublishingStatus, 10000);

    return () => {
      supabase.removeChannel(repliesChannel);
      clearInterval(interval);
    };
  }, []); // Пустой массив зависимостей - запускается только при монтировании

  // При открытии отзыва загрузить существующий черновик
  useEffect(() => {
    const loadDraft = async () => {
      if (!selectedItem) {
        setReplyText("");
        setExistingDraftId(null);
        return;
      }
      
      const isReview = "rating" in selectedItem;
      const { data: drafts } = await supabase
        .from("replies")
        .select("id, content")
        .eq(isReview ? "review_id" : "question_id", selectedItem.id)
        .eq("status", "drafted")
        .order("created_at", { ascending: false })
        .limit(1);
      
      if (drafts && drafts.length > 0) {
        setReplyText(drafts[0].content);
        setExistingDraftId(drafts[0].id);
      } else {
        setReplyText("");
        setExistingDraftId(null);
      }
    };
    
    loadDraft();
  }, [selectedItem]);

  const fetchReviews = async () => {
    setIsTableLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: marketplaces } = await supabase.from("marketplaces").select("id").eq("user_id", user.id);
      if (!marketplaces?.length) {
        setReviews([]);
        setIsTableLoading(false);
        return;
      }
      const marketplaceIds = marketplaces.map((m) => m.id);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // ✅ OPTIMIZATION: Count separately without INNER JOIN to avoid timeout
      // First get count with simple query (no joins)
      let countQuery = supabase
        .from("reviews")
        .select("id", { count: "exact", head: true })
        .in("marketplace_id", marketplaceIds);

      if (statusFilter === "unanswered") {
        countQuery = countQuery.eq("segment", "unanswered");
      } else if (statusFilter === "pending") {
        countQuery = countQuery.eq("segment", "pending");
      } else if (statusFilter === "archived") {
        countQuery = countQuery.eq("segment", "archived");
      }

      if (ratingFilter !== "all") {
        countQuery = countQuery.eq("rating", parseInt(ratingFilter, 10));
      }

      const { count } = await countQuery;

      // Then get data with INNER JOIN (no count to avoid timeout)
      let query = supabase
        .from("reviews")
        .select(
          `*,
     products!inner(name, offer_id, image_url, marketplace_id),
     replies(id, content, status, created_at, tone)`,
        )
        .in("products.marketplace_id", marketplaceIds);

      // ✅ Фильтр по segment на основе URL параметра
      if (statusFilter === "unanswered") {
        query = query.eq("segment", "unanswered");
      } else if (statusFilter === "pending") {
        query = query.eq("segment", "pending");
      } else if (statusFilter === "archived") {
        query = query.eq("segment", "archived");
      }

      // Фильтр по рейтингу
      if (ratingFilter !== "all") {
        query = query.eq("rating", parseInt(ratingFilter, 10));
      }

      // Поиск теперь обрабатывается на клиенте, чтобы поведение было как в разделе "Вопросы"
      // и не зависело от особенностей фильтрации по связанной таблице products.
      // Здесь дополнительных условий по searchQuery не добавляем.

      const { data, error } = await query.order("review_date", { ascending: false }).range(from, to);

      if (error) {
        throw error;
      }

      setReviews((data || []) as ReviewWithDetails[]);
      setTotalReviews(count || 0);
    } catch (error) {
      console.error("Fetch error:", error);
      toast({ title: "Ошибка", description: "Не удалось загрузить отзывы", variant: "destructive" });
    } finally {
      setIsTableLoading(false);
    }
  };

  const fetchQuestions = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: marketplaces } = await supabase.from("marketplaces").select("id").eq("user_id", user.id);
      if (!marketplaces?.length) return;

      const { data, count } = await supabase
        .from("questions")
        .select(`*, products!inner(name, marketplace_id)`, { count: "exact" })
        .in(
          "products.marketplace_id",
          marketplaces.map((m) => m.id),
        )
        .order("question_date", { ascending: false })
        .limit(100);

      setTotalQuestions(count || 0);
      setQuestions((data || []).map((q: any) => ({ ...q, products: q.products || { name: "Товар" } })));
    } catch (e) {
      console.error("Fetch questions error:", e);
    }
  };

  // Клиентская фильтрация, как в разделе "Вопросы покупателей"
  const filteredReviews = reviews.filter((review) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const productName = (getProductName(review) || "").toLowerCase();
    const article = (getProductArticle(review) || "").toLowerCase();
    const text = (review.text || "").toLowerCase();
    const advantages = (review.advantages || "").toLowerCase();
    const disadvantages = (review.disadvantages || "").toLowerCase();
    const author = (review.author_name || "").toLowerCase();

    return (
      productName.includes(q) ||
      article.includes(q) ||
      text.includes(q) ||
      advantages.includes(q) ||
      disadvantages.includes(q) ||
      author.includes(q)
    );
  });

  const handleSelectReview = (id: string, selected: boolean) => {
    if (selected) setSelectedReviewsIds((prev) => [...prev, id]);
    else setSelectedReviewsIds((prev) => prev.filter((item) => item !== id));
  };

  const handleSelectAllReviews = (selected: boolean) => {
    if (selected) {
      const idsOnPage = reviews.map((r) => r.id);
      setSelectedReviewsIds(Array.from(new Set([...selectedReviewsIds, ...idsOnPage])));
    } else {
      setSelectedReviewsIds([]);
    }
  };

  const checkExistingReply = async (reviewId: string): Promise<boolean> => {
    try {
      const { data: existingReplies, error } = await supabase
        .from("replies")
        .select("id, status")
        .eq("review_id", reviewId)
        .in("status", ["scheduled", "publishing", "published"]);

      if (error) {
        console.error(`❌ Ошибка проверки для ${reviewId}:`, error);
        return false;
      }

      const hasReply = existingReplies && existingReplies.length > 0;
      if (hasReply) {
        console.log(`✋ Reply для ${reviewId} уже существует`);
      }
      return hasReply;
    } catch (e) {
      console.error("Ошибка checkExistingReply:", e);
      return false;
    }
  };

  // Массовая отправка - отправляет существующие черновики или генерирует новые
  const handleBulkSend = async () => {
    if (selectedReviewsIds.length === 0) return;
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      let successCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      console.log(`[BulkSend] 🚀 Начинаем отправку ${selectedReviewsIds.length} отзывов`);

      // 1. Получаем все черновики для выбранных отзывов
      const { data: drafts, error: draftsError } = await supabase
        .from("replies")
        .select("id, review_id, content, status")
        .in("review_id", selectedReviewsIds)
        .eq("status", "drafted");

      if (draftsError) {
        console.error("❌ Ошибка загрузки черновиков:", draftsError);
        toast({ title: "Ошибка", description: "Не удалось загрузить черновики", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      const draftsByReviewId: Record<string, { id: string; content: string }> = {};
      for (const draft of drafts || []) {
        if (draft.review_id) {
          draftsByReviewId[draft.review_id] = { id: draft.id, content: draft.content };
        }
      }

      // 2. Получаем marketplace_id для отзывов без черновиков
      const reviewsWithoutDrafts = selectedReviewsIds.filter(id => !draftsByReviewId[id]);
      
      let marketplaceByReviewId: Record<string, string | null> = {};
      
      if (reviewsWithoutDrafts.length > 0) {
        const { data: reviewRows } = await supabase
          .from("reviews")
          .select("id, products!inner(marketplace_id)")
          .in("id", reviewsWithoutDrafts);

        for (const row of reviewRows || []) {
          const mpId = (row as any).products?.marketplace_id ?? null;
          marketplaceByReviewId[row.id as string] = mpId;
        }
      }

      // 3. Обрабатываем каждый выбранный отзыв
      for (const reviewId of selectedReviewsIds) {
        // Проверяем, нет ли уже отправленного ответа
        const hasScheduled = await checkExistingReply(reviewId);
        if (hasScheduled) {
          console.log(`⏭️ Skip ${reviewId}: уже запланирован/отправлен`);
          skippedCount++;
          continue;
        }

        try {
          const existingDraft = draftsByReviewId[reviewId];

          if (existingDraft) {
            // Обновляем существующий черновик на scheduled
            const { error: updateError } = await supabase
              .from("replies")
              .update({
                status: "scheduled",
                scheduled_at: new Date().toISOString(),
                user_id: user.id,
              })
              .eq("id", existingDraft.id);

            if (updateError) {
              console.error(`❌ Ошибка обновления черновика для ${reviewId}:`, updateError);
              errorCount++;
            } else {
              console.log(`✅ Черновик отправлен для ${reviewId}`);
              successCount++;
            }
          } else {
            // Нет черновика - генерируем и сразу отправляем
            const marketplaceId = marketplaceByReviewId[reviewId];
            
            // Получаем данные отзыва для определения рейтинга
            const { data: reviewData } = await supabase
              .from("reviews")
              .select("rating")
              .eq("id", reviewId)
              .single();

            let replyContent: string;
            let replyMode = "semi_auto";

            if (replyMethod === "template") {
              // Используем шаблон
              const { data: templates, error: templateError } = await supabase
                .from("reply_templates")
                .select("id, content, use_count")
                .eq("user_id", user.id)
                .or(`rating.eq.${reviewData?.rating || 5},rating.is.null`)
                .limit(100);

              if (templateError || !templates || templates.length === 0) {
                console.error(`❌ Нет шаблонов для рейтинга ${reviewData?.rating}:`, templateError);
                errorCount++;
                continue;
              }

              // Выбираем случайный шаблон
              const randomTemplate = templates[Math.floor(Math.random() * templates.length)];
              replyContent = randomTemplate.content;

              // Увеличиваем счётчик использования
              await supabase
                .from("reply_templates")
                .update({ use_count: (randomTemplate.use_count || 0) + 1 })
                .eq("id", randomTemplate.id);

              console.log(`✅ Использован шаблон для ${reviewId}`);
            } else {
              // Генерируем через ИИ
              const { data: aiData, error: aiError } = await supabase.functions.invoke("generate-reply", {
                body: { reviewId, tone: replyTone, response_length: responseLength },
              });

              if (aiError || !aiData?.reply) {
                console.error(`❌ AI error для ${reviewId}:`, aiError);
                errorCount++;
                continue;
              }

              replyContent = aiData.reply;
            }

            const { error: saveError } = await supabase.from("replies").insert({
              review_id: reviewId,
              content: replyContent,
              tone: replyTone,
              mode: replyMode,
              status: "scheduled",
              scheduled_at: new Date().toISOString(),
              user_id: user.id,
              marketplace_id: marketplaceId,
            });

            if (saveError) {
              console.error(`❌ Ошибка сохранения для ${reviewId}:`, saveError);
              errorCount++;
            } else {
              console.log(`✅ ${replyMethod === "template" ? "Шаблон" : "ИИ-ответ"} отправлен для ${reviewId}`);
              successCount++;
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (e) {
          console.error(`❌ Критическая ошибка для ${reviewId}:`, e);
          errorCount++;
        }
      }

      const messages = [];
      if (successCount > 0) messages.push(`Отправлено: ${successCount}`);
      if (skippedCount > 0) messages.push(`Пропущено: ${skippedCount}`);
      if (errorCount > 0) messages.push(`Ошибок: ${errorCount}`);

      toast({
        title: "Готово",
        description: messages.join(", "),
        variant: errorCount > 0 ? "destructive" : "default",
      });

      setSelectedReviewsIds([]);
      fetchReviews();
      window.dispatchEvent(new Event("reviews-updated"));
    } catch (e) {
      console.error("Bulk send error:", e);
      toast({ title: "Ошибка", description: "Сбой отправки", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selectedItem || !replyText.trim()) return;
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("No user");

      const isReview = "rating" in selectedItem;
      const marketplaceId = (selectedItem as any).products?.marketplace_id;

      const itemIdField = isReview ? "review_id" : "question_id";
      const { data: existingReplies } = await supabase
        .from("replies")
        .select("id, status")
        .eq(itemIdField, selectedItem.id)
        .in("status", ["scheduled", "publishing", "published"]);

      if (existingReplies && existingReplies.length > 0) {
        toast({
          title: "Внимание",
          description: `Ответ уже существует (статус: ${existingReplies[0].status})`,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      let error;
      
      // Если есть существующий черновик - обновляем его
      if (existingDraftId) {
        const { error: updateError } = await supabase
          .from("replies")
          .update({
            content: replyText,
            tone: replyTone,
            status: "scheduled",
            scheduled_at: scheduleMode === "now" ? new Date().toISOString() : new Date(scheduledDateTime).toISOString(),
            user_id: user.id,
          })
          .eq("id", existingDraftId);
        error = updateError;
      } else {
        // Создаём новый ответ
        const replyData: any = {
          content: replyText,
          tone: replyTone,
          mode: "manual",
          user_id: user.id,
          status: "scheduled",
          scheduled_at: scheduleMode === "now" ? new Date().toISOString() : new Date(scheduledDateTime).toISOString(),
          marketplace_id: marketplaceId,
        };

        if (isReview) replyData.review_id = selectedItem.id;
        else replyData.question_id = selectedItem.id;

        const { error: insertError } = await supabase.from("replies").insert(replyData);
        error = insertError;
      }

      if (error) {
        console.error("Reply error:", error);
        toast({ title: "Ошибка", description: error.message || "Не удалось создать ответ", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Ответ добавлен в очередь" });
        setSelectedItem(null);
        setReplyText("");
        setExistingDraftId(null);
        fetchReviews();
        window.dispatchEvent(new Event("reviews-updated"));
      }
    } catch (e) {
      console.error("Reply error:", e);
      toast({ title: "Ошибка", description: "Произошла ошибка", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
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
          response_length: responseLength,
        },
      });
      if (error) throw error;
      setReplyText(data.reply);
      toast({ title: "Готово", description: "Ответ сгенерирован" });
    } catch (error) {
      console.error("Generate reply error:", error);
      toast({ title: "Ошибка генерации", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-gray-900">Отзывы и вопросы</h1>
              <HelpIcon content="Раздел для управления отзывами и вопросами покупателей.\n\nСтатусы отзывов:\n• Не отвечено - новые отзывы без ответов\n• Ожидают публикации - ответы созданы и отправляются\n• Архив - отзывы с опубликованными ответами\n\nВы можете:\n• Выбрать несколько отзывов и отправить ответы массово\n• Открыть отзыв и ответить вручную\n• Использовать ИИ для генерации ответа\n• Запустить автоматическую генерацию ответов" />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={triggerAutoGenerate}
                disabled={isGenerating}
              >
                <Sparkles className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                {isGenerating ? "Генерация..." : "Автогенерация ответов"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  fetchReviews();
                  fetchQuestions();
                  updatePublishingStatus();
                }}
                disabled={isTableLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isTableLoading ? "animate-spin" : ""}`} />
                Обновить
              </Button>
            </div>
          </div>
        </div>
        
        {/* ✅ Статус-бар процесса автоматической отправки */}
        {(scheduledCount > 0 || publishingCount > 0 || lastGenerationTime) && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-900">Автоматическая отправка:</span>
              </div>
              {scheduledCount > 0 && (
                <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white">
                  <span className="flex items-center gap-1">
                    <Send className="w-3 h-3" />
                    {scheduledCount} в очереди
                  </span>
                </div>
              )}
              {publishingCount > 0 && (
                <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white">
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {publishingCount} отправляется
                  </span>
                </div>
              )}
              {lastGenerationTime && (
                <span className="text-blue-700 text-xs ml-auto">
                  Последняя генерация: {lastGenerationTime.toLocaleTimeString('ru-RU')}
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="reviews" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="reviews">Отзывы</TabsTrigger>
            <TabsTrigger value="questions">Вопросы</TabsTrigger>
          </TabsList>

          <TabsContent value="reviews" className="space-y-4">
            {/* Поиск, фильтры и пагинация над таблицей */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Поиск по товару или артикулу..."
                    className="pl-10 h-9"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Оценка:</span>
                  <HelpIcon content="Фильтр по рейтингу отзывов (1-5 звёзд). Выберите конкретный рейтинг или 'Все' для отображения всех отзывов." />
                  <Select value={ratingFilter} onValueChange={setRatingFilter}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Все" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="5">5 ★</SelectItem>
                      <SelectItem value="4">4 ★</SelectItem>
                      <SelectItem value="3">3 ★</SelectItem>
                      <SelectItem value="2">2 ★</SelectItem>
                      <SelectItem value="1">1 ★</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Пагинация и количество сверху */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Показывать по:</span>
                  <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="ml-4">Всего: {totalReviews}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-sm font-medium px-3">Стр. {page}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={filteredReviews.length < pageSize}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {isTableLoading ? (
              <div className="flex justify-center py-20 bg-white rounded-lg border">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : (
              <ReviewsTable
                reviews={filteredReviews}
                onReviewClick={(r) => setSelectedItem(r)}
                selectedReviews={selectedReviewsIds}
                onSelectReview={handleSelectReview}
                onSelectAll={handleSelectAllReviews}
              />
            )}

            {/* Пагинация снизу */}
            <div className="flex items-center justify-end py-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-medium px-3">Стр. {page}</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={filteredReviews.length < pageSize}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="questions">
            <div className="p-12 text-center text-muted-foreground bg-white rounded-lg border">
              Раздел вопросов в разработке
            </div>
          </TabsContent>
        </Tabs>

        {selectedReviewsIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white shadow-xl rounded-full px-6 py-3 flex items-center gap-4 z-50">
            <span className="font-medium whitespace-nowrap">Выбрано: {selectedReviewsIds.length}</span>

            <div className="flex items-center gap-2">
              <Select value={replyMethod} onValueChange={(v: "template" | "ai") => setReplyMethod(v)}>
                <SelectTrigger className="w-[180px] h-8 bg-white text-black">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Отправить шаблон</SelectItem>
                  <SelectItem value="ai">Отправить ответ ИИ</SelectItem>
                </SelectContent>
              </Select>
              <HelpIcon content={replyMethod === "template" 
                ? "Отзывы будут заполнены случайными шаблонами из вашей базы шаблонов и отправлены.\n\nШаблоны выбираются случайно для каждого рейтинга отзыва."
                : "Ответы будут сгенерированы через ИИ и отправлены.\n\nДлина ответа:\n• Краткий - до 200 символов\n• Обычный - до 400 символов"} />
            </div>

            {replyMethod === "ai" && (
              <div className="flex items-center gap-2">
                <Select value={responseLength} onValueChange={(v: "short" | "normal") => setResponseLength(v)}>
                  <SelectTrigger className="w-[140px] h-8 bg-white text-black">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Краткий</SelectItem>
                    <SelectItem value="normal">Обычный</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              size="sm"
              className="bg-white text-black hover:bg-gray-200 border-none"
              onClick={handleBulkSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
              )}
              {isLoading ? "Обработка..." : "Отправить"}
            </Button>

            <button
              className="text-gray-400 hover:text-white text-sm font-medium"
              onClick={() => setSelectedReviewsIds([])}
            >
              Отмена
            </button>
          </div>
        )}

        <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {selectedItem && "rating" in selectedItem ? "Ответ на отзыв" : "Ответ на вопрос"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6 overflow-y-auto flex-1 p-1">
              <div className="space-y-4">
                <div className="p-4 bg-secondary/20 rounded-lg space-y-3">
                  <div className="font-medium">{selectedItem?.products.name}</div>
                  {selectedItem && "rating" in selectedItem && (
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className={i < selectedItem.rating ? "text-yellow-400" : "text-gray-300"}>
                          ★
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-sm">{selectedItem?.text || "Без текста"}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2 items-center">
                  <Select value={responseLength} onValueChange={(v: "short" | "normal") => setResponseLength(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Краткий</SelectItem>
                      <SelectItem value="normal">Обычный</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={handleGenerateReply} disabled={isGenerating} className="flex-1">
                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сгенерировать AI"}
                  </Button>
                </div>
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={10}
                  placeholder="Ваш ответ..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleReply} disabled={isLoading || !replyText.trim()}>
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Отправить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Reviews;
