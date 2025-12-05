import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "success" | "forbidden" | "error";

export default function ConnectOzonAPI() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [marketplaceId, setMarketplaceId] = useState<string>("");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [status, setStatus] = useState<Status>("idle");

  // Получаем первый маркетплейс пользователя при загрузке
  useEffect(() => {
    async function fetchMarketplace() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Ошибка", description: "Пользователь не авторизован", variant: "destructive" });
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id)
        .eq("type", "ozon")
        .single();

      if (error || !data) {
        toast({ 
          title: "Ошибка", 
          description: "Маркетплейс не найден. Создайте маркетплейс сначала.", 
          variant: "destructive" 
        });
        navigate("/app/connect");
        return;
      }

      setMarketplaceId(data.id);
    }

    fetchMarketplace();
  }, [navigate, toast]);

  const handleCheckAccess = async () => {
    if (!clientId || !apiKey) {
      toast({ title: "Ошибка", description: "Заполните все поля", variant: "destructive" });
      return;
    }

    // Validate client_id is numeric
    if (!/^\d+$/.test(clientId)) {
      toast({ 
        title: "Ошибка", 
        description: "Client-Id должен состоять только из цифр", 
        variant: "destructive" 
      });
      return;
    }

    if (!marketplaceId) {
      toast({ 
        title: "Ошибка", 
        description: "Marketplace ID не загружен. Перезагрузите страницу.", 
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    setStatus("idle");

    try {
      // 1) Check API access via edge function (no Vercel proxy)
      const { data: checkData, error: checkError } = await supabase.functions.invoke("ozon-check", {
        body: { 
          marketplace_id: marketplaceId,
          client_id: clientId.trim(), 
          api_key: apiKey.trim() 
        },
      });

      if (checkError || !checkData?.success) {
        setStatus("error");
        toast({
          title: "Ошибка подключения",
          description: checkError?.message || checkData?.message || "Проверьте Client-Id и API-Key",
          variant: "destructive",
        });
        return;
      }

      // 2) Save credentials to ozon_credentials table
      const { error: upsertError } = await supabase
        .from("ozon_credentials")
        .upsert({
          marketplace_id: marketplaceId,
          client_id: clientId,
          api_key: apiKey,
        }, {
          onConflict: 'marketplace_id'
        });

      if (upsertError) {
        setStatus("error");
        toast({
          title: "Ошибка сохранения",
          description: upsertError.message || "Не удалось сохранить ключи",
          variant: "destructive",
        });
        return;
      }

      setStatus("success");
      toast({ title: "Готово", description: "Подключение настроено" });
    } catch (err: any) {
      setStatus("error");
      toast({
        title: "Ошибка подключения",
        description: err?.message || "Не удалось проверить ключи",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncProducts = async () => {
    if (!marketplaceId) {
      toast({
        title: "Ошибка",
        description: "Marketplace ID не загружен",
        variant: "destructive",
      });
      return;
    }

    setSyncLoading(true);
    toast({ title: "Начинаем синхронизацию", description: "Получаем список товаров из Ozon..." });

    try {
      // Get credentials from ozon_credentials table
      const { data: credsData, error: credsError } = await supabase
        .from("ozon_credentials")
        .select("client_id, api_key")
        .eq("marketplace_id", marketplaceId)
        .single();

      if (credsError || !credsData) {
        toast({
          title: "Ошибка",
          description: "Добавьте Client-Id и API-Key в настройках",
          variant: "destructive",
        });
        return;
      }

      console.log("Calling sync-products with", {
        marketplace_id: marketplaceId,
        client_id: credsData.client_id,
        has_api_key: !!credsData.api_key
      });

      const { data, error } = await supabase.functions.invoke("sync-products", {
        body: {
          marketplace_id: marketplaceId,
          client_id: credsData.client_id,
          api_key: credsData.api_key,
        },
      });

      console.log("Sync result:", { data, error });

      if (error || data?.ok === false) {
        console.error("Sync error:", error || data?.error);
        toast({
          title: "Ошибка синхронизации",
          description: data?.error || error?.message || "Не удалось синхронизировать товары",
          variant: "destructive",
        });
      } else {
        console.log("Sync success:", data);
        toast({
          title: "✅ Синхронизация завершена успешно!",
          description: data?.message || `Добавлено товаров: ${data?.inserted || data?.total || 0}`,
        });
      }
    } catch (e: any) {
      console.error("Unexpected sync error:", e);
      toast({
        title: "Ошибка",
        description: e?.message || "Не удалось выполнить синхронизацию",
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <div className="container max-w-2xl py-8">
      <Button variant="ghost" className="mb-6" onClick={() => navigate("/app/connect/ozon")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад к выбору режима
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Подключение Ozon API</CardTitle>
          <CardDescription>Введите Client-Id и API-Key из кабинета Ozon → Инструменты → API</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientId">Client-Id (только цифры)</Label>
              <Input 
                id="clientId" 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)}
                placeholder="1172055"
                disabled={loading} 
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API-Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {status === "success" && (
            <>
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Ключи проверены и сохранены. Можно синхронизировать товары.
                </AlertDescription>
              </Alert>

              <Button className="w-full" onClick={handleSyncProducts} disabled={syncLoading}>
                {syncLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {syncLoading ? "Синхронизация…" : "Синхронизировать товары"}
              </Button>
            </>
          )}

          {status === "forbidden" && (
            <Alert className="border-orange-500 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                Доступ к API отзывов ограничен. Используйте UI-режим.
              </AlertDescription>
            </Alert>
          )}

          {status === "error" && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Ошибка подключения. Проверьте Client-Id и API-Key.</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3">
            <Button onClick={handleCheckAccess} disabled={loading || !clientId || !apiKey} className="flex-1">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Проверить доступ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
      
