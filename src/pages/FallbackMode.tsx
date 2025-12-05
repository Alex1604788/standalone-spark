import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle, XCircle, Shield, Clock } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FallbackLog {
  id: string;
  marketplace_id: string;
  action_type: string;
  status: string;
  details: any;
  error_message: string | null;
  created_at: string;
}

interface Marketplace {
  id: string;
  name: string;
  fallback_mode: string;
  fallback_enabled: boolean;
  kill_switch_enabled: boolean;
  last_fallback_action_at: string | null;
}

export default function FallbackMode() {
  const [logs, setLogs] = useState<FallbackLog[]>([]);
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch marketplaces with fallback mode
      const { data: mkts, error: mktsError } = await supabase
        .from("marketplaces")
        .select("*")
        .eq("user_id", user.id);

      if (mktsError) throw mktsError;
      setMarketplaces(mkts || []);

      // Fetch fallback logs
      const { data: logsData, error: logsError } = await supabase
        .from("fallback_action_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setLogs(logsData || []);
    } catch (error: any) {
      toast.error("Ошибка загрузки данных: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleKillSwitch = async (marketplaceId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from("marketplaces")
        .update({ kill_switch_enabled: !currentValue })
        .eq("id", marketplaceId);

      if (error) throw error;

      toast.success(!currentValue ? "Kill-switch активирован" : "Kill-switch деактивирован");
      fetchData();
    } catch (error: any) {
      toast.error("Ошибка: " + error.message);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "blocked_by_kill_switch":
        return <Shield className="h-4 w-4 text-orange-500" />;
      case "rate_limited":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      success: "default",
      failed: "destructive",
      blocked_by_kill_switch: "secondary",
      rate_limited: "outline",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
  };

  if (loading) {
    return <div className="p-8">Загрузка...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Фолбэк-режим (UI-имитация)</h1>
        <p className="text-muted-foreground">
          Мониторинг и управление действиями фолбэк-режима
        </p>
      </div>

      <Alert className="mb-6">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Важно!</AlertTitle>
        <AlertDescription>
          Фолбэк-режим работает только при наличии письменного согласия и активной сервисной учетной записи.
          Все действия логируются и могут быть остановлены Kill-switch.
        </AlertDescription>
      </Alert>

      {/* Marketplaces with fallback */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Маркетплейсы с фолбэк-режимом</CardTitle>
          <CardDescription>Управление kill-switch для каждого маркетплейса</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {marketplaces.filter(m => m.fallback_enabled).map((marketplace) => (
              <div key={marketplace.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h3 className="font-semibold">{marketplace.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Режим: {marketplace.fallback_mode}
                  </p>
                  {marketplace.last_fallback_action_at && (
                    <p className="text-xs text-muted-foreground">
                      Последнее действие: {new Date(marketplace.last_fallback_action_at).toLocaleString("ru-RU")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={marketplace.kill_switch_enabled ? "destructive" : "default"}>
                    {marketplace.kill_switch_enabled ? "Kill-switch ON" : "Kill-switch OFF"}
                  </Badge>
                  <Button
                    variant={marketplace.kill_switch_enabled ? "default" : "destructive"}
                    size="sm"
                    onClick={() => toggleKillSwitch(marketplace.id, marketplace.kill_switch_enabled)}
                  >
                    {marketplace.kill_switch_enabled ? "Деактивировать" : "Активировать"}
                  </Button>
                </div>
              </div>
            ))}
            {marketplaces.filter(m => m.fallback_enabled).length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                Нет маркетплейсов с активным фолбэк-режимом
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Журнал действий</CardTitle>
          <CardDescription>Последние 50 действий фолбэк-режима</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Маркетплейс</TableHead>
                <TableHead>Действие</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Детали</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const marketplace = marketplaces.find(m => m.id === log.marketplace_id);
                return (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {new Date(log.created_at).toLocaleString("ru-RU")}
                    </TableCell>
                    <TableCell>{marketplace?.name || "N/A"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        {log.action_type}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(log.status)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {log.error_message || JSON.stringify(log.details) || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Нет записей в журнале
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
