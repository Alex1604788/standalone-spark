import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Pencil, Trash2, Sparkles, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { HelpIcon } from "@/components/HelpIcon";

interface Template {
  id: string;
  name: string;
  content: string;
  tone: string;
  use_count: number;
  rating: number | null;
}

const Templates = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    tone: "friendly",
    rating: null as number | null,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("reply_templates")
      .select("*")
      .eq("user_id", user.id)
      .order("rating", { ascending: true, nullsLast: true })
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить шаблоны",
        variant: "destructive",
      });
    } else {
      setTemplates(data || []);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      toast({
        title: "Ошибка",
        description: "Заполните все обязательные поля",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Ошибка",
        description: "Пользователь не авторизован",
        variant: "destructive",
      });
      return;
    }

    if (editingTemplate) {
      const { error } = await supabase
        .from("reply_templates")
        .update({
          ...formData,
          rating: formData.rating || null,
        })
        .eq("id", editingTemplate.id);

      if (error) {
        toast({
          title: "Ошибка",
          description: "Не удалось обновить шаблон",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Шаблон обновлён",
        });
      }
    } else {
      const { error } = await supabase.from("reply_templates").insert({
        ...formData,
        rating: formData.rating || null,
        user_id: user.id,
      });

      if (error) {
        console.error("Template creation error:", error);
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось создать шаблон",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Успешно",
          description: "Шаблон создан",
        });
      }
    }

    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData({ name: "", content: "", tone: "friendly", rating: null });
    fetchTemplates();
  };

  const handleGenerateTemplates = async () => {
    setIsGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Ошибка",
          description: "Пользователь не авторизован",
          variant: "destructive",
        });
        return;
      }

      // Генерируем 10 шаблонов через ИИ (по 2 на каждый рейтинг)
      const { data, error } = await supabase.functions.invoke("generate-reply-templates", {
        body: {
          user_id: user.id,
          count: 10, // 2 шаблона на каждый рейтинг (1-5)
        },
      });

      if (error) {
        throw error;
      }

      if (data?.templates) {
        // Вставляем сгенерированные шаблоны
        const { error: insertError } = await supabase
          .from("reply_templates")
          .insert(data.templates.map((t: any) => ({ ...t, user_id: user.id })));

        if (insertError) {
          throw insertError;
        }

        toast({
          title: "Успешно",
          description: `Создано ${data.templates.length} шаблонов`,
        });
        fetchTemplates();
      }
    } catch (error: any) {
      console.error("Generate templates error:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сгенерировать шаблоны",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("reply_templates").delete().eq("id", id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить шаблон",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Шаблон удалён",
      });
      fetchTemplates();
    }
  };

  const openEditDialog = (template: Template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      content: template.content,
      tone: template.tone,
      rating: template.rating,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingTemplate(null);
    setFormData({ name: "", content: "", tone: "friendly", rating: null });
  };

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                Шаблоны ответов
              </h1>
              <HelpIcon content="Шаблоны ответов - это готовые тексты для быстрого ответа на отзывы.\n\nКак это работает:\n1. Создайте шаблоны для разных рейтингов (1-5 звёзд)\n2. Включите использование шаблонов в Настройках\n3. Система будет случайно выбирать шаблон вместо генерации через ИИ\n\nПреимущества:\n• Единообразие ответов\n• Контроль над содержанием\n• Экономия на ИИ-генерации\n• Быстрая работа" />
            </div>
            <p className="text-muted-foreground">
              Создавайте и управляйте шаблонами для быстрых ответов на отзывы
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateTemplates}
                disabled={isGenerating}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isGenerating ? "Генерация..." : "Сгенерировать шаблоны"}
              </Button>
              <HelpIcon content="Автоматически создаёт 10 шаблонов ответов (по 2 на каждый рейтинг 1-5 звёзд) с помощью ИИ.\n\nПосле генерации вы можете:\n• Отредактировать шаблоны под свои нужды\n• Удалить ненужные\n• Добавить свои собственные шаблоны" />
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setEditingTemplate(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Создать шаблон
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingTemplate ? "Редактировать шаблон" : "Новый шаблон"}
                </DialogTitle>
                <DialogDescription>
                  Создайте шаблон для быстрых ответов на отзывы и вопросы
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Название шаблона</Label>
                  <Input
                    id="name"
                    placeholder="Например: Благодарность за положительный отзыв"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tone">Тон ответа</Label>
                    <Select
                      value={formData.tone}
                      onValueChange={(value) => setFormData({ ...formData, tone: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="friendly">Дружелюбный</SelectItem>
                        <SelectItem value="formal">Формальный</SelectItem>
                        <SelectItem value="professional">Профессиональный</SelectItem>
                        <SelectItem value="casual">Непринуждённый</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="rating">Рейтинг отзыва (опционально)</Label>
                      <HelpIcon content="Укажите рейтинг отзыва, для которого предназначен этот шаблон.\n\n• Если выбран конкретный рейтинг (1-5) - шаблон будет использоваться только для отзывов с этим рейтингом\n• Если выбрано 'Для всех рейтингов' - шаблон может использоваться для любого рейтинга" />
                    </div>
                    <Select
                      value={formData.rating?.toString() || "all"}
                      onValueChange={(value) => setFormData({ ...formData, rating: value === "all" ? null : parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Для всех рейтингов</SelectItem>
                        <SelectItem value="1">1 звезда</SelectItem>
                        <SelectItem value="2">2 звезды</SelectItem>
                        <SelectItem value="3">3 звезды</SelectItem>
                        <SelectItem value="4">4 звезды</SelectItem>
                        <SelectItem value="5">5 звёзд</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">Текст шаблона</Label>
                  <Textarea
                    id="content"
                    placeholder="Введите текст шаблона..."
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    rows={8}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>
                  Отмена
                </Button>
                <Button onClick={handleSubmit}>
                  {editingTemplate ? "Сохранить изменения" : "Создать шаблон"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {templates.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Нет шаблонов</h3>
            <p className="text-muted-foreground mb-4">
              Создайте первый шаблон для быстрых ответов
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Создать шаблон
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{template.name}</CardTitle>
                        {template.rating && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {renderStars(template.rating)}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        Тон: {template.tone} • Использован: {template.use_count} раз
                        {!template.rating && " • Для всех рейтингов"}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {template.content}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Templates;