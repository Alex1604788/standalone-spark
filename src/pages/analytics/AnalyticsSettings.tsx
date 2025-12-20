import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Bot } from "lucide-react";

interface AnalyticsSettingsData {
  weekly_negative_report_enabled: boolean;
  anomaly_alerts_enabled: boolean;
  anomaly_threshold: number;
  weeks_for_norm: number;
  telegram_chat_id: string | null;
  telegram_connected: boolean;
}

export const AnalyticsSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AnalyticsSettingsData>({
    weekly_negative_report_enabled: false,
    anomaly_alerts_enabled: false,
    anomaly_threshold: 3,
    weeks_for_norm: 4,
    telegram_chat_id: null,
    telegram_connected: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Загружаем настройки из user_settings
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setSettings({
          weekly_negative_report_enabled: (data as any).weekly_negative_report_enabled || false,
          anomaly_alerts_enabled: (data as any).anomaly_alerts_enabled || false,
          anomaly_threshold: (data as any).anomaly_threshold || 3,
          weeks_for_norm: (data as any).weeks_for_norm || 4,
          telegram_chat_id: data.telegram_chat_id || null,
          telegram_connected: !!data.telegram_chat_id,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить настройки",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updates: Partial<AnalyticsSettingsData>) => {
    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const newSettings = { ...settings, ...updates };

      // Проверяем, существует ли запись
      const { data: existing } = await supabase
        .from("user_settings")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const settingsToSave: any = {
        user_id: user.id,
        weekly_negative_report_enabled: newSettings.weekly_negative_report_enabled,
        anomaly_alerts_enabled: newSettings.anomaly_alerts_enabled,
        anomaly_threshold: newSettings.anomaly_threshold,
        weeks_for_norm: newSettings.weeks_for_norm,
        telegram_chat_id: newSettings.telegram_chat_id || null,
      };

      if (existing) {
        const { error } = await supabase
          .from("user_settings")
          .update(settingsToSave)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_settings")
          .insert(settingsToSave);
        if (error) throw error;
      }

      setSettings(newSettings);
      toast({
        title: "Сохранено",
        description: "Настройки успешно сохранены",
      });
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось сохранить настройки",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (field: keyof AnalyticsSettingsData, value: boolean) => {
    await saveSettings({ [field]: value });
  };

  const handleNumberChange = async (field: keyof AnalyticsSettingsData, value: number) => {
    await saveSettings({ [field]: value });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Telegram настройки */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Telegram уведомления
          </CardTitle>
          <CardDescription>
            Настройка уведомлений через Telegram бота
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Статус подключения */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Статус подключения:</span>
              {settings.telegram_connected ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Подключен
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  Не подключен
                </Badge>
              )}
            </div>
          </div>

          {/* Инструкции по подключению */}
          {!settings.telegram_connected && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold mb-2 text-sm">Как подключить Telegram:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Найдите бота @YourAnalyticsBot в Telegram</li>
                <li>Отправьте команду /start</li>
                <li>Скопируйте ваш Chat ID из ответа бота</li>
                <li>Вставьте Chat ID в поле ниже и сохраните</li>
              </ol>
            </div>
          )}

          {/* Chat ID */}
          <div className="space-y-2">
            <Label htmlFor="telegram-chat-id">Telegram Chat ID</Label>
            <div className="flex gap-2">
              <Input
                id="telegram-chat-id"
                type="text"
                placeholder="Введите ваш Chat ID"
                value={settings.telegram_chat_id || ""}
                onChange={(e) => {
                  setSettings({ ...settings, telegram_chat_id: e.target.value || null });
                }}
                disabled={saving}
              />
              <Button
                onClick={() => saveSettings({ telegram_chat_id: settings.telegram_chat_id })}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Chat ID можно получить у Telegram бота после команды /start
            </p>
          </div>

          <Separator />

          {/* Переключатели уведомлений */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="weekly-report">Еженедельный отчёт по негативным отзывам</Label>
                <p className="text-xs text-muted-foreground">
                  Получать еженедельный отчёт с анализом негативных отзывов и рекомендациями
                </p>
              </div>
              <Switch
                id="weekly-report"
                checked={settings.weekly_negative_report_enabled}
                onCheckedChange={(checked) =>
                  handleToggle("weekly_negative_report_enabled", checked)
                }
                disabled={!settings.telegram_connected || saving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="anomaly-alerts">Уведомления об аномальном росте негатива</Label>
                <p className="text-xs text-muted-foreground">
                  Получать уведомления, когда негативные отзывы растут аномально быстро
                </p>
              </div>
              <Switch
                id="anomaly-alerts"
                checked={settings.anomaly_alerts_enabled}
                onCheckedChange={(checked) =>
                  handleToggle("anomaly_alerts_enabled", checked)
                }
                disabled={!settings.telegram_connected || saving}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Параметры аномалий */}
      <Card>
        <CardHeader>
          <CardTitle>Параметры аномалий</CardTitle>
          <CardDescription>
            Настройка порогов и периодов для определения аномалий
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="anomaly-threshold">Порог аномалии (множитель)</Label>
            <Input
              id="anomaly-threshold"
              type="number"
              min={2}
              max={10}
              step={0.5}
              value={settings.anomaly_threshold}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                if (!isNaN(value) && value >= 2 && value <= 10) {
                  handleNumberChange("anomaly_threshold", value);
                }
              }}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Аномалией считается рост негативных отзывов в X раз относительно нормы за последние недели.
              Например, при значении 3 аномалией будет считаться рост в 3 раза больше среднего.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="weeks-for-norm">Количество недель для расчёта нормы</Label>
            <Input
              id="weeks-for-norm"
              type="number"
              min={2}
              max={12}
              value={settings.weeks_for_norm}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 2 && value <= 12) {
                  handleNumberChange("weeks_for_norm", value);
                }
              }}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">
              Количество недель, за которые рассчитывается среднее значение негативных отзывов.
              Это значение используется как "норма" для сравнения.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
