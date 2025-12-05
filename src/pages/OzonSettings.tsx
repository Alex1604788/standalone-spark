import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function OzonCard({ marketplace }: { marketplace: {
  id: string;              // UUID из таблицы marketplaces
  client_id?: string;      // хранится после сохранения ключей
  api_key?: string;        // хранится после сохранения ключей
}}) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-products", {
        body: {
          marketplace_id: marketplace.id,
          client_id: marketplace.client_id,
          api_key: marketplace.api_key,
        },
      });

      if (error || data?.success === false) {
        toast({
          title: "Ошибка синхронизации",
          description: error?.message || data?.error || "Проверьте логи Edge Function",
          variant: "destructive",
        });
      } else {
        toast({ title: "Готово", description: `Синхронизировано: ${data?.count ?? "—"} товаров` });
      }
    } catch (e: any) {
      toast({
        title: "Не удалось вызвать функцию",
        description: e?.message || "Смотрите Network в DevTools",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button onClick={handleSync} disabled={syncing}>
      {syncing ? "Синхронизация…" : "Синхр."}
    </button>
  );
}

export default function OzonSettings() {
  return (
    <div className="container max-w-4xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Настройки Ozon</CardTitle>
          <CardDescription>Управление подключениями к маркетплейсам Ozon</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Настройки синхронизации с Ozon будут доступны здесь.</p>
        </CardContent>
      </Card>
    </div>
  );
}
