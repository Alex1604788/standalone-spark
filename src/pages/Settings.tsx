import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Star, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { HelpIcon } from "@/components/HelpIcon";

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

const Settings = () => {
  const { toast } = useToast();
  const [marketplaces, setMarketplaces] = useState<any[]>([]);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>("");
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchMarketplaces();
  }, []);

  useEffect(() => {
    if (selectedMarketplace) {
      fetchSettings();
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
                      </Label>
                      <HelpIcon content="Если включено, система будет использовать готовые шаблоны ответов вместо генерации через ИИ.\n\nШаблоны можно создать и настроить в разделе 'Шаблоны ответов'. Система будет случайным образом выбирать шаблон, подходящий для данного рейтинга." />
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