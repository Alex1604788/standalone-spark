import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Plus,
  ShoppingBag,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Settings,
  Copy,
  Edit2,
  Check,
  AlertTriangle,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Marketplace {
  id: string;
  name?: string | null;
  type?: string | null;
  is_active: boolean;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_sync_count?: number | null;
  last_sync_total?: number | null;
  created_at: string;
  fallback_enabled?: boolean | null;
  fallback_mode?: string | null;
  kill_switch_enabled?: boolean | null;
  verified_email?: string | null;
  ozon_seller_id?: string | null;
  last_check_at?: string | null;
  last_sync_products_at?: string | null;
  last_sync_reviews_at?: string | null;
}

const s = (v: unknown) => (v ?? "").toString();
const humanizeType = (t?: string | null) => s(t).replace(/_/g, " ").trim() || "—";

const Marketplaces = () => {
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isSyncingProducts, setIsSyncingProducts] = useState<string | null>(null);
  const [isSyncingReviews, setIsSyncingReviews] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);
  const [selectedMarketplaceId, setSelectedMarketplaceId] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasCredsMap, setHasCredsMap] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchMarketplaces();
    const handleVisibilityChange = () => {
      if (!document.hidden) fetchMarketplaces();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const checkHasCreds = async (marketplaceId: string) => {
    try {
      const { data, error } = await supabase
        .from("ozon_credentials")
        .select("id")
        .eq("marketplace_id", marketplaceId)
        .limit(1);

      const hasCreds = !error && Array.isArray(data) && data.length > 0;
      setHasCredsMap((prev) => ({ ...prev, [marketplaceId]: hasCreds }));
      return hasCreds;
    } catch (err) {
      console.warn("Failed to check ozon_credentials, assuming no creds", err);
      setHasCredsMap((prev) => ({ ...prev, [marketplaceId]: false }));
      return false;
    }
  };

  const fetchMarketplaces = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.from("marketplaces").select("*").order("created_at", { ascending: false });

      if (error) {
        console.error("Marketplaces fetch error:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить маркетплейсы",
          variant: "destructive",
        });
      } else {
        console.log("Marketplaces loaded:", data);
        setMarketplaces(Array.isArray(data) ? data : []);
        if (Array.isArray(data)) {
          data.forEach((m) => checkHasCreds(m.id));
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckConnection = async (id: string) => {
    setIsChecking(id);
    try {
      // ✅ Получаем credentials из базы
      const { data: creds, error: credsError } = await supabase
        .from("ozon_credentials")
        .select("client_id, api_key")
        .eq("marketplace_id", id)
        .maybeSingle();

      if (credsError) {
        console.error("Error fetching credentials:", credsError);
        throw new Error("Failed to fetch credentials for connection check");
      }

      if (!creds?.client_id || !creds?.api_key) {
        console.error("Credentials not found for marketplace_id:", id);
        openConnectDialog(id); // Если ключей нет, открываем форму
        return;
      }

      // ✅ Вызываем ozon-check с ключами
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ozon-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace_id: id,
          client_id: creds.client_id, // ✅ Передаём client_id
          api_key: creds.api_key, // ✅ Передаём api_key
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data.success === false) {
        const errorMsg = data.error || data.message || "Ошибка подключения";
        throw new Error(errorMsg);
      }

      toast({
        title: "Соединение с Ozon установлено",
        description: "API работает корректно",
      });
      fetchMarketplaces();
    } catch (e: any) {
      toast({
        title: "Ошибка подключения",
        description: e?.message || "Ошибка подключения",
        variant: "destructive",
      });
    } finally {
      setIsChecking(null);
    }
  };

  const handleSyncProducts = async (id: string) => {
    setIsSyncingProducts(id);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketplace_id: id,
          limit: 100,
          batch: 100,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || data.message || `HTTP ${resp.status}`);
      }
      await supabase.from("marketplaces").update({ last_sync_products_at: new Date().toISOString() }).eq("id", id);
      toast({
        title: "Товары синхронизированы",
        description: `Синхронизация товаров: записано ${data.written_rows ?? 0} из ${data.total_ids ?? 0}`,
      });
      fetchMarketplaces();
    } catch (error: any) {
      toast({
        title: "Ошибка синхронизации товаров",
        description: error?.message || String(error),
        variant: "destructive",
      });
    } finally {
      setIsSyncingProducts(null);
    }
  };

  const handleSyncReviews = async (id: string) => {
    setIsSyncingReviews(id);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketplace_id: id }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || data.message || `HTTP ${resp.status}`);
      }
      await supabase.from("marketplaces").update({ last_sync_reviews_at: new Date().toISOString() }).eq("id", id);
      toast({
        title: "Отзывы синхронизированы",
        description: "Синхронизация отзывов завершена",
      });
      fetchMarketplaces();
    } catch (error: any) {
      toast({
        title: "Ошибка синхронизации отзывов",
        description: error?.message || String(error),
        variant: "destructive",
      });
    } finally {
      setIsSyncingReviews(null);
    }
  };

  const handleSync = async (id: string, _type?: string | null) => {
    setIsSyncing(id);
    try {
      const { data, error: functionError } = await supabase.functions.invoke("sync-ozon", {
        body: { marketplace_id: id },
      });
      if (functionError) throw functionError;

      if (data?.success) {
        toast({
          title: "Синхронизация завершена",
          description: `Отзывов: ${data.stats?.reviews_synced ?? 0}, Вопросов: ${data.stats?.questions_synced ?? 0}, Товаров: ${data.stats?.products_synced ?? 0}`,
        });
        fetchMarketplaces();
      } else if (data?.isFallbackMode) {
        toast({ title: "UI-режим", description: data.error });
      } else {
        throw new Error(data?.error || "Неизвестная ошибка");
      }
    } catch (error) {
      console.error("Sync error:", error);
      toast({
        title: "Ошибка синхронизации",
        description: error instanceof Error ? error.message : "Не удалось синхронизировать данные",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("marketplaces").delete().eq("id", id);
    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить маркетплейс",
        variant: "destructive",
      });
    } else {
      toast({ title: "Успешно", description: "Маркетплейс удалён" });
      fetchMarketplaces();
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase.from("marketplaces").update({ is_active: !currentStatus }).eq("id", id);
    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось изменить статус",
        variant: "destructive",
      });
    } else {
      fetchMarketplaces();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопировано",
      description: "ID магазина скопирован в буфер обмена",
    });
  };

  const startEditing = (id: string, currentName?: string | null) => {
    setEditingId(id);
    setEditingName(s(currentName));
  };

  const saveName = async (id: string) => {
    const { error } = await supabase.from("marketplaces").update({ name: editingName }).eq("id", id);
    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось переименовать магазин",
        variant: "destructive",
      });
    } else {
      toast({ title: "Успешно", description: "Название магазина обновлено" });
      setEditingId(null);
      fetchMarketplaces();
    }
  };

  const disableKillSwitch = async (id: string) => {
    const { error } = await supabase.from("marketplaces").update({ kill_switch_enabled: false }).eq("id", id);
    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось снять защиту",
        variant: "destructive",
      });
    } else {
      toast({ title: "Защита снята", description: "Автоматизация возобновлена" });
      fetchMarketplaces();
    }
  };

  const openConnectDialog = (marketplaceId: string) => {
    setSelectedMarketplaceId(marketplaceId);
    setClientId("");
    setApiKey("");
    setConnectDialogOpen(true);
  };

  const handleSaveCredentials = async () => {
    if (!selectedMarketplaceId || !clientId.trim() || !apiKey.trim()) {
      toast({
        title: "Ошибка",
        description: "Заполните все поля",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d+$/.test(clientId.trim())) {
      toast({
        title: "Ошибка",
        description: "Client ID должен содержать только цифры",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Проверяем credentials через ozon-check (передаём client_id, api_key и marketplace_id)
      const checkResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ozon-check`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace_id: selectedMarketplaceId,
          client_id: clientId.trim(),
          api_key: apiKey.trim(),
        }),
      });

      const checkData = await checkResp.json().catch(() => ({}));

      if (!checkResp.ok || checkData.success === false) {
        const status = checkResp.status;
        let errorMsg = checkData.error || checkData.message || "Неверные учётные данные";

        if (status === 401 || status === 403) {
          errorMsg = "❌ Неверные Client ID или API Key";
        } else if (!checkResp.ok) {
          errorMsg = "⚠️ Ошибка сети. Повторите позже";
        }

        throw new Error(errorMsg);
      }

      // Сохраняем через ozon-save
      const saveResp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ozon-save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketplace_id: selectedMarketplaceId,
          client_id: clientId.trim(),
          api_key: apiKey.trim(),
        }),
      });

      const saveData = await saveResp.json().catch(() => ({}));

      if (!saveResp.ok || saveData.success === false) {
        const errorMsg = saveData.error || saveData.message || `Ошибка сохранения (${saveResp.status})`;

        if (typeof errorMsg === "string" && (errorMsg.includes("foreign key") || errorMsg.includes("FK"))) {
          throw new Error("Сначала создайте магазин (marketplace), затем повторите");
        }

        throw new Error(errorMsg);
      }

      await supabase
        .from("marketplaces")
        .update({ last_check_at: new Date().toISOString() })
        .eq("id", selectedMarketplaceId);

      toast({
        title: "✅ Соединение с Ozon установлено",
        description: "API credentials сохранены и проверены",
      });

      setConnectDialogOpen(false);

      if (selectedMarketplaceId) {
        setHasCredsMap((prev) => ({ ...prev, [selectedMarketplaceId]: true }));
      }

      fetchMarketplaces();

      if (selectedMarketplaceId) {
        setTimeout(() => handleCheckConnection(selectedMarketplaceId), 500);
      }
    } catch (e: any) {
      toast({
        title: "Ошибка подключения",
        description: e?.message || "⚠️ Ошибка сети. Повторите позже",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getMarketplaceLogo = (type?: string | null) => {
    const logos: Record<string, string> = {
      wildberries: "🟣",
      ozon: "🔵",
      yandex_market: "🟡",
    };
    return logos[s(type)] || "🛒";
  };

  const list = Array.isArray(marketplaces) ? marketplaces : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">Маркетплейсы</h1>
            <p className="text-muted-foreground">Подключайте маркетплейсы для управления отзывами и вопросами</p>
          </div>
          <Button onClick={() => navigate("/app/connect")}>
            <Plus className="h-4 w-4 mr-2" />
            Подключить маркетплейс
          </Button>
        </div>

        {isLoading ? (
          <Card className="p-12 text-center">
            <RefreshCw className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50 animate-spin" />
            <h3 className="text-xl font-semibold mb-2">Загрузка маркетплейсов...</h3>
          </Card>
        ) : list.length === 0 ? (
          <Card className="p-12 text-center">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">Нет подключенных маркетплейсов</h3>
            <p className="text-muted-foreground mb-4">
              Подключите свой первый маркетплейс, чтобы начать работу с отзывами
            </p>
            <Button size="lg" onClick={() => navigate("/app/connect")}>
              <Plus className="h-4 w-4 mr-2" />
              Подключить маркетплейс
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {list.map((marketplace) => {
              const name = s(marketplace.name) || "Без названия";
              const typeHuman = humanizeType(marketplace.type);
              const isActive = !!marketplace.is_active;
              const isKill = !!marketplace.kill_switch_enabled;
              const isFallback = !!marketplace.fallback_enabled;

              return (
                <Card key={marketplace.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{getMarketplaceLogo(marketplace.type)}</span>
                          {editingId === marketplace.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="h-8"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={() => saveName(marketplace.id)}>
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <CardTitle>{name}</CardTitle>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => startEditing(marketplace.id, marketplace.name)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                        <CardDescription className="capitalize">
                          {typeHuman}
                          {isFallback && " (UI-режим)"}
                        </CardDescription>

                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant={marketplace.last_check_at ? "default" : "destructive"}>
                            {marketplace.last_check_at ? "🟢 Подключен (API)" : "🔴 Не подключен"}
                          </Badge>
                        </div>
                        {marketplace.last_check_at && (
                          <p className="text-xs text-muted-foreground">
                            Проверено:{" "}
                            {format(new Date(marketplace.last_check_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                          </p>
                        )}
                      </div>

                      <Badge variant={isKill ? "destructive" : isActive ? "default" : "secondary"}>
                        {isKill ? (
                          <>
                            <Shield className="h-3 w-3 mr-1" />
                            Остановлен защитой
                          </>
                        ) : isActive ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Активен
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Неактивен
                          </>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-foreground">ID магазина для расширения:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono bg-background px-2 py-1 rounded flex-1 truncate">
                          {marketplace.id}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(marketplace.id)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Скопируйте этот ID и вставьте его в расширение Автоответ
                      </p>
                    </div>

                    {s(marketplace.verified_email) && (
                      <p className="text-xs text-muted-foreground">Email: {s(marketplace.verified_email)}</p>
                    )}

                    {marketplace.last_sync_at && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Последняя синхронизация:{" "}
                          {format(new Date(marketplace.last_sync_at), "d MMM yyyy, HH:mm", {
                            locale: ru,
                          })}
                        </p>
                        {marketplace.last_sync_status && (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                marketplace.last_sync_status === "success"
                                  ? "default"
                                  : marketplace.last_sync_status === "syncing"
                                    ? "secondary"
                                    : "destructive"
                              }
                              className="text-xs"
                            >
                              {marketplace.last_sync_status === "success" && <CheckCircle className="h-3 w-3 mr-1" />}
                              {marketplace.last_sync_status === "syncing" && (
                                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                              )}
                              {marketplace.last_sync_status === "error" && <XCircle className="h-3 w-3 mr-1" />}
                              {marketplace.last_sync_status}
                            </Badge>
                            {marketplace.last_sync_count !== null && marketplace.last_sync_count > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {marketplace.last_sync_count} товаров
                              </span>
                            )}
                          </div>
                        )}
                        {marketplace.last_sync_error && (
                          <p className="text-xs text-destructive">{marketplace.last_sync_error}</p>
                        )}
                      </div>
                    )}

                    {isKill && (
                      <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-3">
                        <p className="text-xs font-medium text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Автоматизация остановлена
                        </p>
                        <p className="text-xs text-destructive/80 mt-1">Проверьте вход в Ozon и снимите защиту</p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 w-full"
                          onClick={() => disableKillSwitch(marketplace.id)}
                        >
                          <Shield className="h-3 w-3 mr-1" />
                          Снять защиту
                        </Button>
                      </div>
                    )}

                    {isFallback && !isKill && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-blue-900">🔧 UI-режим активен</p>
                        <p className="text-xs text-blue-700 mt-1">
                          {marketplace.fallback_mode === "browser_extension"
                            ? "Через расширение Автоответ"
                            : "Через headful bot"}
                        </p>
                      </div>
                    )}

                    <div className="mb-3">
                      {hasCredsMap[marketplace.id] === false || hasCredsMap[marketplace.id] === undefined ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => openConnectDialog(marketplace.id)}
                          disabled={hasCredsMap[marketplace.id] === undefined}
                        >
                          {hasCredsMap[marketplace.id] === undefined ? "Загрузка..." : "Подключить Ozon"}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleCheckConnection(marketplace.id)}
                          disabled={isChecking === marketplace.id}
                        >
                          {isChecking === marketplace.id ? "Проверяем..." : "Проверить соединение"}
                        </Button>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleSyncProducts(marketplace.id)}
                          disabled={isSyncingProducts === marketplace.id}
                        >
                          <RefreshCw
                            className={`h-4 w-4 mr-2 ${isSyncingProducts === marketplace.id ? "animate-spin" : ""}`}
                          />
                          {isSyncingProducts === marketplace.id ? "Синхронизирую..." : "Синхронизировать товары"}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                          Последняя синхронизация товаров:{" "}
                          {marketplace.last_sync_products_at
                            ? format(new Date(marketplace.last_sync_products_at), "d MMMM yyyy, HH:mm", { locale: ru })
                            : "—"}
                        </p>
                      </div>

                      <div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => handleSyncReviews(marketplace.id)}
                          disabled={isSyncingReviews === marketplace.id}
                        >
                          <RefreshCw
                            className={`h-4 w-4 mr-2 ${isSyncingReviews === marketplace.id ? "animate-spin" : ""}`}
                          />
                          {isSyncingReviews === marketplace.id ? "Синхронизирую..." : "Синхронизировать отзывы"}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-1">
                          Последняя синхронизация отзывов:{" "}
                          {marketplace.last_sync_reviews_at
                            ? format(new Date(marketplace.last_sync_reviews_at), "d MMMM yyyy, HH:mm", { locale: ru })
                            : "—"}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(marketplace.id, marketplace.type)}
                        disabled={isSyncing === marketplace.id}
                        title="Полная синхронизация (вопросы + отзывы через UI)"
                      >
                        <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing === marketplace.id ? "animate-spin" : ""}`} />
                        Всё
                      </Button>

                      {s(marketplace.type) === "ozon" && (
                        <Button variant="outline" size="sm" onClick={() => navigate("/app/settings/ozon")}>
                          <Settings className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(marketplace.id, !!marketplace.is_active)}
                      >
                        {marketplace.is_active ? "Откл." : "Вкл."}
                      </Button>

                      <Button variant="outline" size="sm" onClick={() => handleDelete(marketplace.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={connectDialogOpen} onOpenChange={setConnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Подключить Ozon API</DialogTitle>
            <DialogDescription>Введите ваши API credentials для подключения к Ozon Seller API</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="client-id">Client ID</Label>
              <Input
                id="client-id"
                placeholder="Введите Client ID (только цифры)"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">Цифровой идентификатор вашего магазина в Ozon</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="Введите API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={isSaving}
              />
              <p className="text-xs text-muted-foreground">Секретный ключ API из личного кабинета Ozon</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConnectDialogOpen(false)} disabled={isSaving}>
              Отмена
            </Button>
            <Button onClick={handleSaveCredentials} disabled={isSaving || !clientId.trim() || !apiKey.trim()}>
              {isSaving ? "Проверяем..." : "Сохранить и проверить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplaces;
