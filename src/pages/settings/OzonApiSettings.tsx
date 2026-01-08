import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Save, Key, Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Marketplace {
  id: string;
  name: string | null;
  type: string | null;
}

interface ApiCredentials {
  id?: string;
  marketplace_id: string;
  api_type: string;
  client_id: string;
  client_secret: string;
  auto_sync_enabled: boolean;
  sync_frequency: string;
  access_token?: string | null;
  token_expires_at?: string | null;
}

const OzonApiSettings = () => {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<string>("");
  const [credentials, setCredentials] = useState<ApiCredentials | null>(null);
  const [formData, setFormData] = useState({
    client_id: "",
    client_secret: "",
    auto_sync_enabled: false,
    sync_frequency: "daily",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<number>(0); // Процент прогресса 0-100
  const [lastFullSync, setLastFullSync] = useState<{period: string, date: string, progress: string, rows: number} | null>(null);
  const [lastDailySync, setLastDailySync] = useState<{period: string, date: string, progress: string, rows: number} | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadMarketplaces();
  }, []);

  useEffect(() => {
    if (selectedMarketplaceId) {
      loadCredentials(selectedMarketplaceId);
    }
  }, [selectedMarketplaceId]);

  // Автоматический polling статуса синхронизации каждые 3 секунды
  // Показывает прогресс даже если пользователь не нажимал кнопки (автосинк, CRON)
  useEffect(() => {
    if (!selectedMarketplaceId) return;

    const checkSyncStatus = async () => {
      // 1. Получить последнюю синхронизацию (любого типа) для текущего статуса
      const { data: lastSync, error } = await supabase
        .from("ozon_sync_history")
        .select("*")
        .eq("marketplace_id", selectedMarketplaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!error && lastSync) {
        const metadata = lastSync.metadata as any;
        const syncPeriod = metadata?.sync_period;

        if (lastSync.status === "in_progress") {
          setIsSyncing(true);

          // Для full sync показываем прогресс с auto-continue
          if (syncPeriod === 'full' && metadata?.current_offset !== undefined && metadata?.total_campaigns) {
            const currentOffset = metadata.current_offset || 0;
            const totalCampaigns = metadata.total_campaigns || 1;
            const progressPercent = Math.round((currentOffset / totalCampaigns) * 100);

            setSyncProgress(progressPercent);
            setSyncStatus(`Полная синхронизация: ${currentOffset}/${totalCampaigns} кампаний (${progressPercent}%)`);
          } else {
            const step = metadata?.current_step || "Синхронизация в процессе...";
            const rowsCollected = metadata?.rows_collected || 0;
            setSyncProgress(50); // Неопределённый прогресс - показываем 50%
            setSyncStatus(`${step} (собрано ${rowsCollected} записей)`);
          }
        } else if (lastSync.status === "completed") {
          setIsSyncing(false);
          setSyncProgress(100);
          setSyncStatus(`Завершено: ${lastSync.rows_inserted || 0} записей за период ${lastSync.period_from} - ${lastSync.period_to}`);
        } else if (lastSync.status === "failed" || lastSync.status === "timeout") {
          setIsSyncing(false);
          setSyncProgress(0);
          setSyncStatus(`Ошибка: ${lastSync.error_message || lastSync.status}`);
        }
      }

      // 2. Получить последнюю ПОЛНУЮ синхронизацию (за 62 дня)
      const { data: fullSync } = await supabase
        .from("ozon_sync_history")
        .select("*")
        .eq("marketplace_id", selectedMarketplaceId)
        .eq("trigger_type", "manual_full")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      if (fullSync) {
        setLastFullSync({
          period: `${fullSync.period_from} - ${fullSync.period_to}`,
          date: new Date(fullSync.completed_at || fullSync.started_at).toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }),
          progress: '100% завершена',
          rows: fullSync.rows_inserted || 0,
        });
      }

      // 3. Получить последнюю ДНЕВНУЮ синхронизацию (за 7 дней)
      const { data: dailySync } = await supabase
        .from("ozon_sync_history")
        .select("*")
        .eq("marketplace_id", selectedMarketplaceId)
        .eq("status", "completed")
        .in("trigger_type", ["manual", "auto", "cron"])
        .order("completed_at", { ascending: false })
        .limit(10); // Берем 10 последних, фильтруем по периоду

      if (dailySync && dailySync.length > 0) {
        // Найти последнюю синхронизацию за ~7 дней (не 62)
        const sevenDaySync = dailySync.find(sync => {
          if (!sync.period_from || !sync.period_to) return false;
          const daysDiff = Math.round(
            (new Date(sync.period_to).getTime() - new Date(sync.period_from).getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysDiff >= 6 && daysDiff <= 10; // 7 дней ±3
        });

        if (sevenDaySync) {
          setLastDailySync({
            period: `${sevenDaySync.period_from} - ${sevenDaySync.period_to}`,
            date: new Date(sevenDaySync.completed_at || sevenDaySync.started_at).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            progress: '100% завершена',
            rows: sevenDaySync.rows_inserted || 0,
          });
        }
      }
    };

    // Проверяем сразу при загрузке
    checkSyncStatus();

    // Запускаем polling каждые 3 секунды
    const interval = setInterval(checkSyncStatus, 3000);

    return () => clearInterval(interval);
  }, [selectedMarketplaceId]);

  const loadMarketplaces = async () => {
    const { data, error } = await supabase
      .from("marketplaces")
      .select("id, name, type")
      .eq("is_active", true)
      .order("name");

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить маркетплейсы",
        variant: "destructive",
      });
      return;
    }

    setMarketplaces(data || []);
    if (data && data.length > 0 && !selectedMarketplaceId) {
      setSelectedMarketplaceId(data[0].id);
    }
  };

  const loadCredentials = async (marketplaceId: string) => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("marketplace_api_credentials")
      .select("*")
      .eq("marketplace_id", marketplaceId)
      .eq("api_type", "performance")
      .single();

    if (error && error.code !== "PGRST116") {
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить настройки API",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (data) {
      setCredentials(data);
      setFormData({
        client_id: data.client_id,
        client_secret: "••••••••", // Hide secret
        auto_sync_enabled: data.auto_sync_enabled,
        sync_frequency: data.sync_frequency,
      });
    } else {
      setCredentials(null);
      setFormData({
        client_id: "",
        client_secret: "",
        auto_sync_enabled: false,
        sync_frequency: "daily",
      });
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    if (!selectedMarketplaceId) {
      toast({
        title: "Ошибка",
        description: "Выберите маркетплейс",
        variant: "destructive",
      });
      return;
    }

    if (!formData.client_id || !formData.client_secret || formData.client_secret === "••••••••") {
      toast({
        title: "Ошибка",
        description: "Заполните Client ID и Client Secret",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);

    const payload = {
      marketplace_id: selectedMarketplaceId,
      api_type: "performance",
      client_id: formData.client_id,
      client_secret: formData.client_secret,
      auto_sync_enabled: formData.auto_sync_enabled,
      sync_frequency: formData.sync_frequency,
    };

    const { error } = await supabase
      .from("marketplace_api_credentials")
      .upsert(payload, { onConflict: "marketplace_id,api_type" });

    setIsSaving(false);

    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Успешно",
      description: "Настройки API сохранены",
    });

    loadCredentials(selectedMarketplaceId);
  };

  const handleTestConnection = async () => {
    if (!selectedMarketplaceId || !credentials) {
      toast({
        title: "Ошибка",
        description: "Сначала сохраните настройки API",
        variant: "destructive",
      });
      return;
    }

    setIsTesting(true);

    try {
      const { data, error } = await supabase.functions.invoke("sync-ozon-performance", {
        body: { marketplace_id: selectedMarketplaceId, test: true },
      });

      if (error) throw error;

      toast({
        title: "Успешно",
        description: "Подключение к OZON API установлено",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось подключиться к OZON API",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncData = async (syncType: 'full' | 'daily' = 'daily') => {
    if (!selectedMarketplaceId || !credentials) {
      toast({
        title: "Ошибка",
        description: "Сначала сохраните настройки API",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    const periodText = syncType === 'full' ? '62 дней (полная)' : '7 дней (ежедневная)';
    setSyncStatus(`Запуск синхронизации за ${periodText}...`);

    try {
      const body: any = {
        marketplace_id: selectedMarketplaceId,
        sync_period: syncType, // 'full' или 'daily'
      };

      const { data, error } = await supabase.functions.invoke("sync-ozon-performance", {
        body,
      });

      if (error) throw error;

      // НЕ сбрасываем isSyncing здесь - пусть polling обнаружит завершение
      const description = syncType === 'full'
        ? 'Полная синхронизация за 62 дня запущена. Она будет автоматически продолжаться пакетами по 24 кампании. Следите за прогрессом на экране.'
        : 'Синхронизация за 7 дней выполняется. Следите за прогрессом на экране.';

      toast({
        title: "Синхронизация запущена",
        description,
      });
    } catch (error: any) {
      setIsSyncing(false);
      setSyncStatus("Ошибка запуска синхронизации");
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось запустить синхронизацию",
        variant: "destructive",
      });
    }
  };

  const selectedMarketplace = marketplaces.find((m) => m.id === selectedMarketplaceId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки OZON Performance API</h1>
        <p className="text-muted-foreground mt-2">
          Настройте автоматическую синхронизацию данных по продвижению товаров из OZON Performance API
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Как получить Client ID и Client Secret:</strong>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>Откройте OZON Seller → Настройки → API ключи</li>
            <li>Создайте новый ключ для "Performance API"</li>
            <li>Скопируйте Client ID и Client Secret</li>
            <li>Вставьте их в форму ниже</li>
          </ol>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Учетные данные API
          </CardTitle>
          <CardDescription>Настройте доступ к OZON Performance API для получения данных по продвижению</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Выбор маркетплейса */}
          <div className="space-y-2">
            <Label>Маркетплейс</Label>
            <Select value={selectedMarketplaceId} onValueChange={setSelectedMarketplaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите маркетплейс" />
              </SelectTrigger>
              <SelectContent>
                {marketplaces.map((mp) => (
                  <SelectItem key={mp.id} value={mp.id}>
                    {mp.name || mp.type || mp.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedMarketplaceId && (
            <>
              {/* Client ID */}
              <div className="space-y-2">
                <Label htmlFor="client_id">Client ID</Label>
                <Input
                  id="client_id"
                  placeholder="Введите Client ID из OZON Seller"
                  value={formData.client_id}
                  onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                  disabled={isLoading}
                />
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label htmlFor="client_secret">Client Secret</Label>
                <Input
                  id="client_secret"
                  type="password"
                  placeholder="Введите Client Secret из OZON Seller"
                  value={formData.client_secret}
                  onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                  disabled={isLoading}
                />
                {credentials && formData.client_secret === "••••••••" && (
                  <p className="text-xs text-muted-foreground">
                    Secret сохранен. Введите новое значение для изменения.
                  </p>
                )}
              </div>

              {/* Auto Sync */}
              <div className="flex items-center justify-between space-x-2 border rounded-lg p-4">
                <div className="space-y-0.5 flex-1">
                  <Label htmlFor="auto_sync">Автоматическая синхронизация</Label>
                  <p className="text-sm text-muted-foreground">
                    Синхронизация за последние 7 дней, выполняется раз в сутки в 02:00 UTC
                  </p>
                </div>
                <Switch
                  id="auto_sync"
                  checked={formData.auto_sync_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, auto_sync_enabled: checked })}
                  disabled={isLoading}
                />
              </div>

              {/* Status */}
              {credentials && (
                <div className="border rounded-lg p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Статус подключения:</span>
                    <Badge variant={credentials.access_token ? "default" : "secondary"}>
                      {credentials.access_token ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Подключено
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Не подключено
                        </>
                      )}
                    </Badge>
                  </div>
                  {credentials.token_expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Токен истекает: {new Date(credentials.token_expires_at).toLocaleString("ru-RU")}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button onClick={handleSave} disabled={isSaving || isLoading}>
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Сохранить
                    </>
                  )}
                </Button>
                {credentials && (
                  <Button variant="outline" onClick={handleTestConnection} disabled={isTesting}>
                    {isTesting ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Проверка...
                      </>
                    ) : (
                      <>
                        <Activity className="w-4 h-4 mr-2" />
                        Проверить подключение
                      </>
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Синхронизация данных */}
      {credentials && credentials.access_token && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Синхронизация данных
            </CardTitle>
            <CardDescription>
              Загрузите данные по продвижению товаров из OZON Performance API в систему
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Статус синхронизации - УПРОЩЕННАЯ ВЕРСИЯ без прогресс-бара */}
            {isSyncing && (
              <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-900 dark:text-blue-100">
                        Синхронизация выполняется - {syncProgress}%
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {syncStatus || 'Загрузка данных из OZON...'}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        Синхронизация может занять несколько минут. Не закрывайте страницу.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Статус последней синхронизации (когда НЕ идет) */}
            {!isSyncing && syncStatus && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{syncStatus}</AlertDescription>
              </Alert>
            )}

            {/* Статистика синхронизаций */}
            {(lastFullSync || lastDailySync) && !isSyncing && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {lastFullSync && (
                  <Card className="border-green-200 dark:border-green-900">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">
                            Последняя полная синхронизация (62 дня)
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            📅 {lastFullSync.date}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            📊 Период: {lastFullSync.period}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ✅ Записей: {lastFullSync.rows.toLocaleString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {lastDailySync && (
                  <Card className="border-blue-200 dark:border-blue-900">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-blue-600 mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            Последняя синхронизация (7 дней)
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            📅 {lastDailySync.date}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            📊 Период: {lastDailySync.period}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ✅ Записей: {lastDailySync.rows.toLocaleString('ru-RU')}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Полная синхронизация (62 дня) */}
            <div className="space-y-3 p-4 border rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">Полная синхронизация (62 дня)</h4>
                  <p className="text-sm text-muted-foreground">
                    Загружает ВСЕ данные за 62 дня по всем кампаниям (RUNNING + STOPPED)
                  </p>
                </div>
                <Button onClick={() => handleSyncData('full')} disabled={isSyncing} size="lg">
                  {isSyncing ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Запустить
                </Button>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Автоматически продолжается пакетами по 24 кампании. Может занять 30-60 минут для 351 кампании.
                </AlertDescription>
              </Alert>
            </div>

            {/* Автоматическая ежедневная синхронизация */}
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">Автоматическая синхронизация (7 дней)</h4>
                    <Badge variant={formData.auto_sync_enabled ? "default" : "secondary"}>
                      {formData.auto_sync_enabled ? "Включена" : "Отключена"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Запускается раз в сутки, синхронизирует последние 7 дней
                  </p>
                </div>
                <Switch
                  checked={formData.auto_sync_enabled}
                  onCheckedChange={(checked) => {
                    setFormData(prev => ({ ...prev, auto_sync_enabled: checked }));
                  }}
                />
              </div>
              {formData.auto_sync_enabled && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Синхронизация выполняется автоматически каждые 24 часа в 02:00 по UTC.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Ручная синхронизация за 7 дней */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Или запустите синхронизацию вручную:</p>
              <Button onClick={() => handleSyncData('daily')} disabled={isSyncing} variant="outline">
                {isSyncing ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Синхронизировать за 7 дней
              </Button>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Обратите внимание:</strong> Синхронизация может занять несколько минут в зависимости от объема
                данных. OZON предоставляет данные с группировкой по дням, что позволяет точно рассчитать затраты на
                продвижение для каждого SKU.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OzonApiSettings;
