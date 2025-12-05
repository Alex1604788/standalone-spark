import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AppSettings = () => {
  const [settings, setSettings] = useState({
    auto_reply_enabled: false,
    semi_auto_mode: true,
    require_approval_low_rating: true,
    telegram_notifications: false,
    telegram_chat_id: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setSettings({
        auto_reply_enabled: data.auto_reply_enabled || false,
        semi_auto_mode: data.semi_auto_mode !== false,
        require_approval_low_rating: data.require_approval_low_rating !== false,
        telegram_notifications: data.telegram_notifications || false,
        telegram_chat_id: data.telegram_chat_id || "",
      });
    } else if (!data) {
      // Create default settings if not exist
      await supabase.from("user_settings").insert({
        user_id: user.id,
        semi_auto_mode: true,
        require_approval_low_rating: true,
      });
    }
  };

  const updateSettings = async (updates: Partial<typeof settings>) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsLoading(true);
    const { error } = await supabase
      .from("user_settings")
      .upsert({
        user_id: user.id,
        ...settings,
        ...updates,
      });

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: "Настройки сохранены",
      });
      setSettings({ ...settings, ...updates });
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6 max-w-3xl">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Настройки
          </h1>
          <p className="text-muted-foreground">
            Управляйте настройками автоответов и уведомлений
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Режимы работы</CardTitle>
            <CardDescription>
              Выберите режим автоматизации ответов
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Автоматический режим</Label>
                <p className="text-sm text-muted-foreground">
                  Ответы публикуются автоматически без модерации
                </p>
              </div>
              <Switch
                checked={settings.auto_reply_enabled}
                onCheckedChange={(checked) =>
                  updateSettings({ auto_reply_enabled: checked })
                }
                disabled={isLoading}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Полуавтоматический режим</Label>
                <p className="text-sm text-muted-foreground">
                  ИИ генерирует черновики, требуется утверждение
                </p>
              </div>
              <Switch
                checked={settings.semi_auto_mode}
                onCheckedChange={(checked) =>
                  updateSettings({ semi_auto_mode: checked })
                }
                disabled={isLoading}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Обязательное утверждение низких оценок</Label>
                <p className="text-sm text-muted-foreground">
                  Отзывы с оценкой ≤2★ всегда требуют утверждения
                </p>
              </div>
              <Switch
                checked={settings.require_approval_low_rating}
                onCheckedChange={(checked) =>
                  updateSettings({ require_approval_low_rating: checked })
                }
                disabled={isLoading}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telegram уведомления</CardTitle>
            <CardDescription>
              Получайте уведомления о новых отзывах и вопросах в Telegram
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Включить Telegram уведомления</Label>
                <p className="text-sm text-muted-foreground">
                  Уведомления о новых отзывах, вопросах и публикациях
                </p>
              </div>
              <Switch
                checked={settings.telegram_notifications}
                onCheckedChange={(checked) =>
                  updateSettings({ telegram_notifications: checked })
                }
                disabled={isLoading}
              />
            </div>
            {settings.telegram_notifications && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="telegram_chat_id">Telegram Chat ID</Label>
                  <Input
                    id="telegram_chat_id"
                    placeholder="Введите ваш Telegram Chat ID"
                    value={settings.telegram_chat_id}
                    onChange={(e) =>
                      setSettings({ ...settings, telegram_chat_id: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Получите Chat ID от @userinfobot в Telegram
                  </p>
                  <Button
                    onClick={() =>
                      updateSettings({ telegram_chat_id: settings.telegram_chat_id })
                    }
                    disabled={isLoading}
                  >
                    Сохранить Chat ID
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Информация о безопасности</CardTitle>
            <CardDescription>
              Меры безопасности и конфиденциальности
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>✓ Все API ключи хранятся в зашифрованном виде</p>
            <p>✓ Ответы фильтруются от запрещённого контента</p>
            <p>✓ Низкие оценки (≤2★) проходят обязательную модерацию</p>
            <p>✓ Возможность отмены публикации в течение 30 минут</p>
            <p>✓ Полный аудит всех действий в системе</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AppSettings;