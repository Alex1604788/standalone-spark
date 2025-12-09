import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, Calendar, CheckCircle, XCircle, Edit, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { HelpIcon } from "@/components/HelpIcon";

interface DraftReply {
  id: string;
  content: string;
  status: string;
  created_at: string;
  review_id: string | null;
  question_id: string | null;
  reviews?: {
    id: string;
    author_name: string;
    text: string | null;
    advantages: string | null;
    disadvantages: string | null;
    rating: number;
    review_date: string;
    products: {
      name: string;
    };
  } | null;
  questions?: {
    id: string;
    author_name: string;
    text: string;
    question_date: string;
    products: {
      name: string;
    };
  } | null;
}

const ReviewQueue = () => {
  const [drafts, setDrafts] = useState<DraftReply[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<DraftReply | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    const { data, error } = await supabase
      .from("replies")
      .select(`
        *,
        reviews(*, products(name)),
        questions(*, products(name))
      `)
      .eq("status", "drafted")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить черновики",
        variant: "destructive",
      });
    } else {
      setDrafts(data || []);
    }
  };

  const handleApprove = async (draft: DraftReply) => {
    setIsLoading(true);
    const { error } = await supabase
      .from("replies")
      .update({ 
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
        can_cancel_until: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      })
      .eq("id", draft.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось утвердить ответ",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Ответ отправлен на публикацию. Вы можете отменить в течение 30 минут",
      });
      fetchDrafts();
    }
    setIsLoading(false);
  };

  const handleDiscard = async (draftId: string) => {
    setIsLoading(true);
    const { error } = await supabase
      .from("replies")
      .delete()
      .eq("id", draftId);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось отклонить ответ",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Ответ отклонён",
      });
      fetchDrafts();
    }
    setIsLoading(false);
  };

  const handleEdit = (draft: DraftReply) => {
    setSelectedDraft(draft);
    setEditedContent(draft.content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedDraft) return;

    setIsLoading(true);
    const { error } = await supabase
      .from("replies")
      .update({ content: editedContent })
      .eq("id", selectedDraft.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить изменения",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Изменения сохранены",
      });
      setIsEditing(false);
      setSelectedDraft(null);
      fetchDrafts();
    }
    setIsLoading(false);
  };

  const handleRegenerate = async (draft: DraftReply) => {
    setIsRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: {
          [draft.review_id ? "reviewId" : "questionId"]: draft.review_id || draft.question_id,
          tone: "formal",
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
        const { error: updateError } = await supabase
          .from("replies")
          .update({ content: data.reply })
          .eq("id", draft.id);

        if (updateError) throw updateError;

        toast({
          title: "Готово",
          description: "Ответ перегенерирован",
        });
        fetchDrafts();
      }
    } catch (error: any) {
      console.error("Error regenerating reply:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось перегенерировать ответ",
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Очередь модерации
            </h1>
            <HelpIcon content="Очередь модерации - это черновики ответов, созданные системой в полуавтоматическом режиме.\n\nКак это работает:\n1. Система автоматически создаёт черновики для новых отзывов\n2. Черновики появляются здесь для вашей проверки\n3. Вы можете:\n   • Утвердить ответ - он будет отправлен\n   • Отредактировать ответ перед отправкой\n   • Перегенерировать ответ через ИИ\n   • Удалить черновик\n\nПосле утверждения ответ отправляется на публикацию. Вы можете отменить отправку в течение 30 минут." />
          </div>
          <p className="text-muted-foreground">
            Просмотрите и утвердите ответы, сгенерированные ИИ
          </p>
        </div>

        {drafts.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Нет черновиков</h3>
            <p className="text-muted-foreground">
              Все ответы обработаны
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {drafts.map((draft) => {
              const item = draft.reviews || draft.questions;
              if (!item) return null;

              const isReview = !!draft.reviews;
              const lowRating = isReview && (item as any).rating <= 2;

              return (
                <Card key={draft.id} className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{item.author_name}</h3>
                          {lowRating && (
                            <Badge variant="destructive">Низкий рейтинг</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.products.name}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isReview && (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < (item as any).rating
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {format(
                            new Date(isReview ? (item as any).review_date : (item as any).question_date),
                            "d MMMM yyyy",
                            { locale: ru }
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg">
                      <p className="text-sm font-medium mb-1">Отзыв/Вопрос:</p>
                      <p className="text-sm">{isReview ? (item as any).text : (item as any).text}</p>
                    </div>

                    <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">Предложенный ответ:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerate(draft)}
                          disabled={isRegenerating}
                        >
                          <Sparkles className="h-4 w-4 mr-1" />
                          {isRegenerating ? "Генерация..." : "Перегенерировать"}
                        </Button>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{draft.content}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleApprove(draft)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Принять
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleEdit(draft)}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Изменить
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => handleDiscard(draft.id)}
                        disabled={isLoading}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Отклонить
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={isEditing} onOpenChange={setIsEditing}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Редактировать ответ</DialogTitle>
              <DialogDescription>
                Отредактируйте текст ответа перед публикацией
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Длина: {editedContent.length} символов (рекомендуется до 400)
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Отмена
              </Button>
              <Button onClick={handleSaveEdit} disabled={isLoading}>
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ReviewQueue;
