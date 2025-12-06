import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Star, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

    // Пересчитать статусы существующих черновиков в соответствии с новыми режимами
    // Сначала получаем все отзывы по рейтингам для этого маркетплейса
    const { data: reviewsByRating, error: reviewsError } = await supabase
      .from("reviews")
      .select("id, rating")
      .eq("marketplace_id", selectedMarketplace);

    console.log("[Settings] Reviews by rating:", reviewsByRating?.length, reviewsError);

    if (reviewsByRating && reviewsByRating.length > 0) {
      const modeUpdates = [
        { rating: 1, mode: settings.reviews_mode_1 },
        { rating: 2, mode: settings.reviews_mode_2 },
        { rating: 3, mode: settings.reviews_mode_3 },
        { rating: 4, mode: settings.reviews_mode_4 },
        { rating: 5, mode: settings.reviews_mode_5 },
      ];

      for (const { rating, mode } of modeUpdates) {
        // Получаем review_ids для этого рейтинга
        const reviewIds = reviewsByRating
          .filter(r => r.rating === rating)
          .map(r => r.id);

        if (reviewIds.length === 0) continue;

        console.log(`[Settings] Rating ${rating}, mode: ${mode}, reviews: ${reviewIds.length}`);

        if (mode === "auto") {
          // Переводим drafted -> scheduled для отзывов с этим рейтингом
          const { data: updated, error: updateError } = await supabase
            .from("replies")
            .update({ 
              status: "scheduled", 
              mode: "auto",
              scheduled_at: new Date().toISOString() 
            })
            .eq("status", "drafted")
            .in("review_id", reviewIds)
            .select("id");

          console.log(`[Settings] Updated to scheduled:`, updated?.length || 0, updateError);
        } else {
          // Если режим = semi, переводим scheduled обратно в drafted
          const { data: updated, error: updateError } = await supabase
            .from("replies")
            .update({ 
              status: "drafted", 
              mode: "semi_auto",
              scheduled_at: null 
            })
            .eq("status", "scheduled")
            .in("review_id", reviewIds)
            .select("id");

          console.log(`[Settings] Updated to drafted:`, updated?.length || 0, updateError);
        }
      }
    }

    // Аналогично для вопросов
    const { data: questionIds } = await supabase
      .from("questions")
      .select("id")
      .eq("marketplace_id", selectedMarketplace);

    if (questionIds && questionIds.length > 0) {
      const qIds = questionIds.map(q => q.id);
      
      if (settings.questions_mode === "auto") {
        await supabase
          .from("replies")
          .update({ 
            status: "scheduled", 
            mode: "auto",
            scheduled_at: new Date().toISOString() 
          })
          .eq("status", "drafted")
          .in("question_id", qIds);
      } else if (settings.questions_mode === "semi") {
        await supabase
          .from("replies")
          .update({ 
            status: "drafted", 
            mode: "semi_auto",
            scheduled_at: null 
          })
          .eq("status", "scheduled")
          .in("question_id", qIds);
      }
    }

    setIsLoading(false);
    toast({
      title: "Сохранено",
      description: "Настройки обновлены и применены к существующим черновикам",
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
            <h3 className="text-lg font-semibold mb-4">Режимы ответов на отзывы</h3>
            <p className="text-sm text-muted-foreground mb-6">
              В полуавтоматическом режиме ИИ генерирует ответы, но отправка требует подтверждения.
              В автоматическом режиме ответы отправляются без подтверждения.
            </p>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((rating) => (
                <div key={rating} className="flex items-center justify-between border-b pb-4">
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
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Режим ответов на вопросы</h3>
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
            <h3 className="text-lg font-semibold mb-4">Расширенные настройки</h3>
            <div className="space-y-4">
              <div>
                <Label>Длина ответа</Label>
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