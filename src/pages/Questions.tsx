import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Search, RefreshCw, Sparkles, Package, HelpCircle, Copy, FileDown, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import * as XLSX from "xlsx";
import { HelpIcon } from "@/components/HelpIcon";

interface Question {
  id: string;
  external_id: string;
  author_name: string;
  text: string;
  question_date: string;
  is_answered: boolean;
  product_id: string;
  marketplace_id: string;
  products: {
    name: string;
    image_url?: string;
    offer_id?: string | null;
  };
  replies?: { status: string }[];
}

const Questions = () => {
  const { status } = useParams<{ status: "unanswered" | "archived" }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [replyText, setReplyText] = useState("");
  const [replyTone, setReplyTone] = useState("friendly");
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const fetchQuestions = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: marketplaces, error: mpErr } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);

    if (mpErr || !marketplaces || marketplaces.length === 0) {
      setQuestions([]);
      return;
    }

    const marketplaceIds = marketplaces.map((m) => m.id);

    let query = supabase
      .from("questions")
      .select(
        `
        id,
        external_id,
        author_name,
        text,
        question_date,
        is_answered,
        product_id,
        marketplace_id,
        products(id, name, image_url, offer_id),
        replies(status)
      `,
      )
      .in("marketplace_id", marketplaceIds);

    // Фильтр по статусу (левое меню: Не отвечено / Архив)
    if (status === "unanswered") {
      query = query.eq("is_answered", false);
    } else if (status === "archived") {
      query = query.eq("is_answered", true);
    }

    const { data, error } = await query.order("question_date", { ascending: false }).limit(100);

    if (error) {
      console.error("Error fetching questions:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить вопросы",
        variant: "destructive",
      });
      setQuestions([]);
      return;
    }

    const withProducts = (data || []).map((q: any) => {
      const prod = Array.isArray(q.products) ? q.products[0] : q.products;

      return {
        ...q,
        products: {
          name: prod?.name || "—",
          image_url: prod?.image_url,
          offer_id: prod?.offer_id || null,
        },
        replies: q.replies || [],
      } as Question;
    });

    setQuestions(withProducts);
  };

  const handleGenerateReply = async () => {
    if (!selectedQuestion) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          questionId: selectedQuestion.id,
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
          title: "✓ Ответ сгенерирован",
          description: "Проверьте текст и отправьте",
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

  const handleTrainAI = async () => {
    if (!selectedQuestion || !replyText.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите текст ответа для обучения ИИ",
        variant: "destructive",
      });
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      const { error } = await supabase.from("product_knowledge").insert({
        product_id: selectedQuestion.product_id,
        marketplace_id: selectedQuestion.marketplace_id,
        title: `Вопрос: ${selectedQuestion.text.substring(0, 100)}${selectedQuestion.text.length > 100 ? '...' : ''}`,
        content: replyText,
        source_type: "manager",
        source_question_id: selectedQuestion.id,
        relevance_score: 1.0,
        created_by: user.id,
        tags: ["вопрос-ответ"],
      });

      if (error) throw error;

      toast({
        title: "✓ ИИ обучена",
        description: "Знание успешно добавлено в базу",
      });
    } catch (error: any) {
      console.error("Error training AI:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить знание",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchQuestions();
    setIsLoading(false);
    toast({
      title: "Обновлено",
      description: "Данные успешно обновлены",
    });
  };

  const filteredQuestions = questions.filter((question) => {
    const q = searchQuery.toLowerCase();
    return (
      question.author_name.toLowerCase().includes(q) ||
      question.text.toLowerCase().includes(q) ||
      question.products.name.toLowerCase().includes(q) ||
      (question.products.offer_id || "").toLowerCase().includes(q)
    );
  });

  // Определяем статус по replies + is_answered
  const getStatusBadge = (question: Question) => {
    const replies = question.replies || [];
    const statuses = replies.map((r) => r.status);

    if (statuses.includes("error")) {
      return <Badge variant="destructive">Ошибка</Badge>;
    }

    if (statuses.includes("published") || question.is_answered) {
      return <Badge className="bg-green-500">Отвечено</Badge>;
    }

    if (statuses.includes("scheduled") || statuses.includes("publishing")) {
      return <Badge variant="outline">В очереди</Badge>;
    }

    return <Badge variant="secondary">Без ответа</Badge>;
  };

  const pageTitle = status === "unanswered" ? "Не отвечено" : status === "archived" ? "Архив" : "Вопросы";

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuestionIds(filteredQuestions.map((q) => q.id));
    } else {
      setSelectedQuestionIds([]);
    }
  };

  const handleSelectQuestion = (questionId: string, checked: boolean) => {
    if (checked) {
      setSelectedQuestionIds([...selectedQuestionIds, questionId]);
    } else {
      setSelectedQuestionIds(selectedQuestionIds.filter((id) => id !== questionId));
    }
  };

  const handleExportToSupplier = () => {
    const selectedQuestions = questions.filter((q) => selectedQuestionIds.includes(q.id));

    const excelData = selectedQuestions.map((q) => ({
      "Название товара": q.products.name,
      "Артикул": q.products.offer_id || "",
      "Текст вопроса": q.text,
      "Ссылка на изображение": q.products.image_url || "",
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Вопросы");

    const now = new Date();
    const filename = `questions_for_supplier_${format(now, "yyyy-MM-dd_HH-mm")}.xlsx`;
    
    XLSX.writeFile(wb, filename);

    toast({
      title: "Файл создан",
      description: `Выгружено вопросов: ${selectedQuestions.length}`,
    });

    setSelectedQuestionIds([]);
  };

  const allSelected = filteredQuestions.length > 0 && selectedQuestionIds.length === filteredQuestions.length;
  const someSelected = selectedQuestionIds.length > 0 && selectedQuestionIds.length < filteredQuestions.length;

  return (
    <div className="space-y-6">
      {/* Заголовок страницы (если нужен сверху) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{pageTitle}</h1>
          <HelpIcon content="Раздел для управления вопросами покупателей о товарах.\n\nСтатусы вопросов:\n• Без ответа - новые вопросы без ответов\n• В очереди - ответы созданы и отправляются\n• Отвечено - вопросы с опубликованными ответами\n• Ошибка - произошла ошибка при отправке\n\nВы можете:\n• Выбрать несколько вопросов и ответить массово\n• Открыть вопрос и ответить вручную\n• Использовать ИИ для генерации ответа\n• Обучить ИИ, добавив вопрос-ответ в базу знаний\n• Экспортировать вопросы для поставщика" />
        </div>
      </div>

      {/* Фильтры */}
      <Card className="p-4 shadow-soft">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по автору, тексту, товару или артикулу..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={handleRefresh} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>
      </Card>

      {/* Таблица вопросов */}
      {filteredQuestions.length === 0 ? (
        <Card className="p-12 text-center shadow-soft">
          <HelpCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold mb-2">Нет вопросов</h3>
          <p className="text-muted-foreground mb-4">Вопросы от покупателей появятся здесь</p>
          <Button onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Обновить данные
          </Button>
        </Card>
      ) : (
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Выбрать все"
                    className={someSelected ? "data-[state=checked]:bg-primary/50" : ""}
                  />
                </TableHead>
                <TableHead className="w-[80px]">Фото товара</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead className="max-w-md">Текст вопроса</TableHead>
                <TableHead className="w-[140px]">Статус ответа</TableHead>
                <TableHead className="w-[100px] text-right">Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuestions.map((question) => (
                <TableRow key={question.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell>
                    <Checkbox
                      checked={selectedQuestionIds.includes(question.id)}
                      onCheckedChange={(checked) => handleSelectQuestion(question.id, checked as boolean)}
                      aria-label={`Выбрать вопрос ${question.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div
                      className="w-12 h-12 rounded-md overflow-hidden bg-muted flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => {
                        const url = `https://www.ozon.ru/product/${question.external_id}`;
                        window.open(url, "_blank");
                      }}
                    >
                      {question.products.image_url ? (
                        <img
                          src={question.products.image_url}
                          alt={question.products.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-[220px]">
                    <div className="truncate">{question.products.name}</div>
                    {question.products.offer_id && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <span>Артикул: {question.products.offer_id}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 hover:bg-muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(question.products.offer_id || "");
                            toast({
                              title: "Скопировано",
                              description: "Артикул скопирован в буфер обмена",
                            });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(question.question_date), "d MMM yyyy", {
                      locale: ru,
                    })}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm line-clamp-2">{question.text}</p>
                  </TableCell>
                  <TableCell>{getStatusBadge(question)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setSelectedQuestion(question)}>
                      Открыть
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Модалка вопроса */}
      <Dialog open={!!selectedQuestion} onOpenChange={() => setSelectedQuestion(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              Вопрос от {selectedQuestion?.author_name}
            </DialogTitle>
            <DialogDescription>{selectedQuestion?.products.name}</DialogDescription>
          </DialogHeader>

          {selectedQuestion && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Текст вопроса</Label>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="whitespace-pre-wrap">{selectedQuestion.text}</p>
                </div>
              </div>

              {/* Блок ответа */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Ответ</Label>
                  <div className="flex items-center gap-2">
                    <Select value={replyTone} onValueChange={setReplyTone}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Дружелюбный</SelectItem>
                        <SelectItem value="formal">Формальный</SelectItem>
                        <SelectItem value="professional">Профессиональный</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleGenerateReply} disabled={isGenerating} variant="outline" size="sm">
                      <Sparkles className={`h-4 w-4 mr-2 ${isGenerating ? "animate-pulse" : ""}`} />
                      {isGenerating ? "Генерация..." : "Сгенерировать"}
                    </Button>
                  </div>
                </div>
                <Textarea
                  placeholder="Введите текст ответа..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSelectedQuestion(null)}>
              Отмена
            </Button>
            <div className="flex gap-2 flex-1 justify-end">
              <Button
                variant="secondary"
                onClick={handleTrainAI}
                disabled={!replyText.trim()}
              >
                <Brain className="h-4 w-4 mr-2" />
                Обучить ИИ
              </Button>
              <Button
                onClick={async () => {
                  if (!selectedQuestion || !replyText.trim()) return;
                  try {
                    const {
                      data: { user },
                    } = await supabase.auth.getUser();
                    if (!user) throw new Error("Пользователь не авторизован");

                    const { error } = await supabase.from("replies").insert({
                      question_id: selectedQuestion.id,
                      marketplace_id: selectedQuestion.marketplace_id,
                      content: replyText,
                      mode: "manual",
                      status: "scheduled",
                      scheduled_at: new Date().toISOString(),
                      user_id: user.id,
                      tone: replyTone,
                    });

                    if (error) throw error;

                    toast({
                      title: "Ответ отправлен",
                      description: "Ответ добавлен в очередь на публикацию",
                    });
                    setSelectedQuestion(null);
                    setReplyText("");
                    fetchQuestions();
                  } catch (error: any) {
                    toast({
                      title: "Ошибка",
                      description: error.message,
                      variant: "destructive",
                    });
                  }
                }}
                disabled={!replyText.trim()}
              >
                Отправить ответ
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Панель действий */}
      {selectedQuestionIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-50">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Выбрано вопросов: <span className="font-semibold text-foreground">{selectedQuestionIds.length}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setSelectedQuestionIds([])}>
                Отменить
              </Button>
              <Button onClick={handleExportToSupplier}>
                <FileDown className="h-4 w-4 mr-2" />
                Выгрузить поставщику
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Questions;
