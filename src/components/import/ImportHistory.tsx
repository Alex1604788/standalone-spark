import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImportLog {
  id: string;
  import_type: string;
  file_name: string;
  status: "processing" | "completed" | "failed";
  records_imported: number;
  records_failed: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const IMPORT_TYPE_LABELS: Record<string, string> = {
  accruals: "Начисления ОЗОН",
  storage_costs: "Стоимость размещения",
  promotion_costs: "Затраты на продвижение",
  business_data: "Номенклатура",
};

export const ImportHistory = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: importLogs, isLoading } = useQuery({
    queryKey: ["import-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as ImportLog[];
    },
  });

  const handleDelete = async (logId: string) => {
    if (!confirm("Удалить эту запись из истории импорта?")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("import_logs")
        .delete()
        .eq("id", logId);

      if (error) throw error;

      toast({
        title: "Запись удалена",
        description: "Запись успешно удалена из истории",
      });

      // Обновляем список
      queryClient.invalidateQueries({ queryKey: ["import-logs"] });
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить запись",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "processing":
        return <Clock className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge variant="default" className="bg-green-600">Завершен</Badge>;
      case "failed":
        return <Badge variant="destructive">Ошибка</Badge>;
      case "processing":
        return <Badge variant="secondary">В процессе</Badge>;
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>История импорта</CardTitle>
        <CardDescription>Последние загрузки данных</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Загрузка...</div>
        ) : !importLogs || importLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет истории импорта
          </div>
        ) : (
          <div className="space-y-3">
            {importLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
              >
                <div className="mt-1">{getStatusIcon(log.status)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1">
                      <p className="font-semibold text-sm truncate">
                        {log.file_name || IMPORT_TYPE_LABELS[log.import_type] || log.import_type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {IMPORT_TYPE_LABELS[log.import_type] || log.import_type}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(log.id)}
                        title="Удалить запись"
                      >
                        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-1">
                    <span>{formatDate(log.created_at)}</span>
                    {log.status === "completed" && (
                      <>
                        <span>•</span>
                        <span className="text-green-600 font-medium">
                          Импортировано: {log.records_imported}
                        </span>
                        {log.records_failed > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-red-600 font-medium">
                              Ошибок: {log.records_failed}
                            </span>
                          </>
                        )}
                      </>
                    )}
                  </div>

                  {log.error_message && (
                    <p className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
                      {log.error_message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
