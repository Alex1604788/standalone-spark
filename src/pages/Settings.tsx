import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Star, Save, Sparkles, Plus, Pencil, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HelpIcon } from "@/components/HelpIcon";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface MarketplaceSettings {
  id: string;
  marketplace_id: string;
  reviews_mode_1: string;
  reviews_mode_2: string;
  reviews_mode_3: string;
  reviews_mode_4: string;
  reviews_mode_5: string;
  questions_mode: string;
  reply_length: string;
  use_templates_1?: boolean;
  use_templates_2?: boolean;
  use_templates_3?: boolean;
  use_templates_4?: boolean;
  use_templates_5?: boolean;
}

interface Template {
  id: string;
  name: string;
  content: string;
  tone: string;
  rating: number | null;
  use_count: number;
}

const Settings = () => {
  const { toast } = useToast();
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("");
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    content: "",
    tone: "friendly",
    rating: null as number | null,
  });

  useEffect(() => {
    fetchMarketplaces();
  }, []);

  useEffect(() => {
    if (selectedMarketplace) {
      fetchSettings();
      fetchTemplates();
    }
  }, [selectedMarketplace]);

  const fetchMarketplaces = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("marketplaces")
      .select("id, name, type")
      .eq("user_id", user.id);

    if (!error && data) {
      setMarketplaces(data);
      if (data.length > 0) {
        setSelectedMarketplace(data[0].id);
      }
    }
  };

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
      console.error("Error fetching templates:", error);
    } else {
      setTemplates(data || []);
    }
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

      const { data, error } = await supabase.functions.invoke("generate-reply-templates", {
        body: {
          user_id: user.id,
          count: 10,
        },
      });

      if (error) throw error;

      if (data?.templates) {
        const { error: insertError } = await supabase
          .from("reply_templates")
          .insert(data.templates.map((t: any) => ({ ...t, user_id: user.id })));

        if (insertError) throw insertError;

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

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот шаблон?")) return;

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

  const handleSubmitTemplate = async () => {
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

    closeDialog();
    fetchTemplates();
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

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from("marketplace_settings")
      .select("*")
      .eq("marketplace_id", selectedMarketplace)
      .single();

    if (!error && data) {
      setSettings(data);
    } else if (error?.code === 'PGRST116') {
      // Настройки не найдены, создаём дефолтные с reply_length = short
      const { data: newSettings } = await supabase
        .from("marketplace_settings")
        .insert({ 
          marketplace_id: selectedMarketplace,
          reply_length: 'short'
        })
        .select()
        .single();
      
      if (newSettings) setSettings(newSettings);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setIsLoading(true);

    const { error } = await supabase
      .from("marketplace_settings")
      .update({
        reviews_mode_1: settings.reviews_mode_1,
        reviews_mode_2: settings.reviews_mode_2,
        reviews_mode_3: settings.reviews_mode_3,
        reviews_mode_4: settings.reviews_mode_4,
        reviews_mode_5: settings.reviews_mode_5,
        questions_mode: settings.questions_mode,
        reply_length: settings.reply_length,
        use_templates_1: settings.use_templates_1 || false,
        use_templates_2: settings.use_templates_2 || false,
        use_templates_3: settings.use_templates_3 || false,
        use_templates_4: settings.use_templates_4 || false,
        use_templates_5: settings.use_templates_5 || false,
      })
      .eq("id", settings.id);

    if (error) {
      setIsLoading(false);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
      return;
    }

    // Вызываем edge function для обновления статусов черновиков
    const { data: updateResult, error: updateError } = await supabase.functions.invoke(
      "update-reply-statuses",
      {
        body: {
          marketplace_id: selectedMarketplace,
          settings: {
            reviews_mode_1: settings.reviews_mode_1,
            reviews_mode_2: settings.reviews_mode_2,
            reviews_mode_3: settings.reviews_mode_3,
            reviews_mode_4: settings.reviews_mode_4,
            reviews_mode_5: settings.reviews_mode_5,
            questions_mode: settings.questions_mode,
          },
        },
      }
    );

    setIsLoading(false);

    if (updateError) {
      console.error("[Settings] Error updating reply statuses:", updateError);
    } else {
      console.log("[Settings] Updated statuses:", updateResult);
    }

    toast({
      title: "Сохранено",
      description: `Настройки обновлены. ${updateResult?.updated_to_scheduled || 0} ответов поставлено в очередь.`,
    });
  };

  const updateReviewMode = (rating: number, mode: string) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [`reviews_mode_${rating}`]: mode,
    });
  };

  const renderStars = (count: number) => {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: count }).map((_, i) => (
          <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label>Выберите маркетплейс</Label>
            <Select value={selectedMarketplace} onValueChange={setSelectedMarketplace}>
              <SelectTrigger className="w-full mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {marketplaces.map((mp) => (
                  <SelectItem key={mp.id} value={mp.id}>
                    {mp.name} ({mp.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {settings && (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">Режимы ответов на отзывы</h3>
              <HelpIcon content="Выберите режим работы для каждого рейтинга отзывов:\n\n• Полуавтоматический: система создаёт черновики ответов, вы проверяете и отправляете вручную\n• Автоматический: система автоматически генерирует и отправляет ответы без вашего участия\n\nРекомендуется использовать автоматический режим для положительных отзывов (4-5 звёзд), а полуавтоматический - для негативных (1-2 звезды)." />
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              В полуавтоматическом режиме ИИ генерирует ответы, но отправка требует подтверждения.
              В автоматическом режиме ответы отправляются без подтверждения.
            </p>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((rating) => (
                <div key={rating} className="space-y-3 border-b pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {renderStars(rating)}
                    </div>
                    <RadioGroup
                      value={settings[`reviews_mode_${rating}` as keyof MarketplaceSettings] as string}
                      onValueChange={(value) => updateReviewMode(rating, value)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="semi" id={`semi-${rating}`} />
                        <Label htmlFor={`semi-${rating}`}>Полуавтоматический</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="auto" id={`auto-${rating}`} />
                        <Label htmlFor={`auto-${rating}`}>Автоматический</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <div className="flex items-center justify-between pl-8">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`use-templates-${rating}`} className="text-sm font-normal cursor-pointer">
                        Использовать шаблоны ответов
                        <span className="text-xs text-muted-foreground ml-2">
                          (вместо ИИ-генерации)
                        </span>
                      </Label>
                      <HelpIcon content="Если включено, система будет использовать готовые шаблоны ответов вместо генерации через ИИ.\n\nШаблоны можно создать и настроить в разделе 'Шаблоны ответов'. Система будет случайным образом выбирать шаблон, подходящий для данного рейтинга.\n\nПреимущества:\n• Единообразие ответов\n• Контроль над содержанием\n• Экономия на ИИ-генерации" />
                    </div>
                    <Switch
                      id={`use-templates-${rating}`}
                      checked={settings[`use_templates_${rating}` as keyof MarketplaceSettings] as boolean || false}
                      onCheckedChange={(checked) => {
                        setSettings({
                          ...settings,
                          [`use_templates_${rating}`]: checked,
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">Режим ответов на вопросы</h3>
              <HelpIcon content="Настройте режим автоматических ответов на вопросы покупателей:\n\n• Отключен: ответы не генерируются автоматически\n• Полуавтоматический: создаются черновики для проверки\n• Автоматический: ответы отправляются автоматически" />
            </div>
            <RadioGroup
              value={settings.questions_mode}
              onValueChange={(value) => setSettings({ ...settings, questions_mode: value })}
              className="space-y-3"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="off" id="questions-off" />
                <Label htmlFor="questions-off">Отключен</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="semi" id="questions-semi" />
                <Label htmlFor="questions-semi">Полуавтоматический</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="auto" id="questions-auto" />
                <Label htmlFor="questions-auto">Автоматический</Label>
              </div>
            </RadioGroup>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Шаблоны ответов</h3>
                <HelpIcon content="Шаблоны ответов - это готовые тексты для быстрого ответа на отзывы.\n\nКак это работает:\n1. Создайте шаблоны для разных рейтингов (1-5 звёзд)\n2. Включите использование шаблонов выше для нужных рейтингов\n3. Система будет случайно выбирать шаблон вместо генерации через ИИ\n\nПреимущества:\n• Единообразие ответов\n• Контроль над содержанием\n• Экономия на ИИ-генерации" />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateTemplates}
                  disabled={isGenerating}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isGenerating ? "Генерация..." : "Сгенерировать шаблоны"}
                </Button>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={() => setEditingTemplate(null)}>
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
                        Создайте шаблон для быстрых ответов на отзывы
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Название шаблона</Label>
                        <input
                          id="name"
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Например: Благодарность за 5 звёзд"
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
                          <Label htmlFor="rating">Рейтинг отзыва (опционально)</Label>
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
                      <Button onClick={handleSubmitTemplate}>
                        {editingTemplate ? "Сохранить изменения" : "Создать шаблон"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Нет шаблонов. Нажмите "Сгенерировать шаблоны" для автоматического создания или "Создать шаблон" для ручного создания.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {templates.map((template) => (
                  <div key={template.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{template.name}</span>
                        {template.rating && (
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {renderStars(template.rating)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{template.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Тон: {template.tone} • Использован: {template.use_count} раз
                        {!template.rating && " • Для всех рейтингов"}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(template)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold">Расширенные настройки</h3>
              <HelpIcon content="Дополнительные параметры для настройки ответов:\n\n• Длина ответа: краткий (до 200 символов) или обычный (до 400 символов)" />
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Длина ответа</Label>
                  <HelpIcon content="Выберите максимальную длину генерируемых ответов:\n\n• Краткий: до 200 символов, 2-3 предложения\n• Обычный: до 400 символов, 3-5 предложений" />
                </div>
                <Select
                  value={settings.reply_length}
                  onValueChange={(value) => setSettings({ ...settings, reply_length: value })}
                >
                  <SelectTrigger className="w-full mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Краткий</SelectItem>
                    <SelectItem value="normal">Обычный</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isLoading}>
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? "Сохранение..." : "Сохранить настройки"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default Settings;