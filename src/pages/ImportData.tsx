import { useState } from "react";
import { Upload, Database, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileUploader, type ImportType } from "@/components/import/FileUploader";
import { ImportHistory } from "@/components/import/ImportHistory";
import { useQuery } from "@tanstack/react-query";

const ImportData = () => {
  const [importType, setImportType] = useState<ImportType>("accruals");
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const { toast } = useToast();

  // Получаем текущий маркетплейс
  const { data: marketplace } = useQuery({
    queryKey: ["active-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplaces")
        .select("*")
        .eq("is_active", true)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const handleFileSelect = (data: any[], name: string) => {
    setFileData(data);
    setFileName(name);
    setImportResult(null);
  };

  const handleClear = () => {
    setFileData(null);
    setFileName("");
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!fileData || !marketplace) {
      toast({
        title: "Ошибка",
        description: "Выберите файл и маркетплейс",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportResult(null);

    try {
      // 1. Создаем лог импорта
      const { data: importLog, error: logError } = await supabase
        .from("import_logs")
        .insert({
          marketplace_id: marketplace.id,
          import_type: importType,
          file_name: fileName,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          status: "processing",
        })
        .select()
        .single();

      if (logError) throw logError;

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // 2. Обрабатываем каждую строку
      for (let i = 0; i < fileData.length; i++) {
        const row = fileData[i];
        setImportProgress(((i + 1) / fileData.length) * 100);

        try {
          await importRow(row, importType, marketplace.id, importLog.id);
          successCount++;
        } catch (error: any) {
          failedCount++;
          errors.push(`Строка ${i + 1}: ${error.message}`);
          console.error(`Error importing row ${i + 1}:`, error);
        }
      }

      // 3. Обновляем лог импорта
      await supabase
        .from("import_logs")
        .update({
          status: failedCount === fileData.length ? "failed" : "completed",
          records_imported: successCount,
          records_failed: failedCount,
          error_message: errors.length > 0 ? errors.slice(0, 5).join("\\n") : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", importLog.id);

      setImportResult({
        success: successCount,
        failed: failedCount,
        errors,
      });

      toast({
        title: "Импорт завершен",
        description: `Успешно: ${successCount}, Ошибок: ${failedCount}`,
      });

      // Очищаем после успешного импорта
      if (successCount > 0) {
        handleClear();
      }
    } catch (error: any) {
      console.error("Import error:", error);
      toast({
        title: "Ошибка импорта",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Функция импорта одной строки
  const importRow = async (
    row: any,
    type: ImportType,
    marketplaceId: string,
    importBatchId: string
  ) => {
    switch (type) {
      case "accruals":
        await importAccruals(row, marketplaceId, importBatchId);
        break;
      case "storage_costs":
        await importStorageCosts(row, marketplaceId, importBatchId);
        break;
    }
  };

  // Импорт начислений ОЗОН
  const importAccruals = async (row: any, marketplaceId: string, importBatchId: string) => {
    // Поиск колонок по частичному совпадению (Excel может добавлять пробелы)
    const findColumn = (keywords: string[]) => {
      const keys = Object.keys(row);
      return keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
    };

    const accrualTypeCol = findColumn(["тип начисления", "тип"]);
    const offerIdCol = findColumn(["артикул"]);
    const skuCol = findColumn(["sku", "ску"]);
    const quantityCol = findColumn(["количество"]);
    const amountBeforeCol = findColumn(["до вычета", "до комиссии", "продажа", "возврат"]);
    const totalCol = findColumn(["итого", "сумма", "руб"]);

    // ДИАГНОСТИКА: логируем первую строку для отладки
    if (!totalCol && Object.keys(row).length > 0) {
      console.log("⚠️ Колонка 'Итого' не найдена! Доступные колонки:", Object.keys(row));
      console.log("⚠️ Первая строка данных:", row);
    }
    const dateCol = findColumn(["дата"]);

    if (!accrualTypeCol || !offerIdCol) {
      throw new Error("Не найдены обязательные колонки: Тип начисления, Артикул");
    }

    const { error } = await supabase.from("ozon_accruals").insert({
      marketplace_id: marketplaceId,
      accrual_date: dateCol && row[dateCol] ? new Date(row[dateCol]).toISOString().split("T")[0] : periodStart,
      offer_id: String(row[offerIdCol]).trim(),
      sku: skuCol ? String(row[skuCol]).trim() : null,
      accrual_type: String(row[accrualTypeCol]).trim(),
      quantity: quantityCol ? parseFloat(String(row[quantityCol]).replace(",", ".")) || 0 : 0,
      amount_before_commission: amountBeforeCol ? parseFloat(String(row[amountBeforeCol]).replace(",", ".")) || 0 : 0,
      total_amount: totalCol ? parseFloat(String(row[totalCol]).replace(",", ".")) || 0 : 0,
      import_batch_id: importBatchId,
    });

    if (error) throw error;
  };

  // Импорт стоимости размещения
  const importStorageCosts = async (row: any, marketplaceId: string, importBatchId: string) => {
    const findColumn = (keywords: string[]) => {
      const keys = Object.keys(row);
      return keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
    };

    const dateCol = findColumn(["дата"]);
    const offerIdCol = findColumn(["артикул"]);
    const skuCol = findColumn(["sku", "ску"]);
    const costCol = findColumn(["стоимость размещения", "стоимость", "размещение"]);
    const stockCol = findColumn(["остаток", "количество", "экземпляр"]);

    if (!dateCol || !offerIdCol) {
      throw new Error("Не найдены обязательные колонки: Дата, Артикул");
    }

    const { error } = await supabase.from("storage_costs").insert({
      marketplace_id: marketplaceId,
      cost_date: new Date(row[dateCol]).toISOString().split("T")[0],
      offer_id: String(row[offerIdCol]).trim(),
      sku: skuCol ? String(row[skuCol]).trim() : null,
      storage_cost: costCol ? parseFloat(String(row[costCol]).replace(",", ".")) || 0 : 0,
      stock_quantity: stockCol ? parseInt(String(row[stockCol]).replace(/[^\d]/g, "")) || 0 : 0,
      import_batch_id: importBatchId,
    });

    if (error) throw error;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toISOString().split("T")[0];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Заголовок */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent flex items-center gap-3">
            <Upload className="w-10 h-10 text-primary" />
            Импорт данных
          </h1>
          <p className="text-muted-foreground">
            Загрузка Excel файлов из OZON в базу данных
          </p>
        </div>

        {/* Выбор типа импорта */}
        <Card>
          <CardHeader>
            <CardTitle>Тип импорта</CardTitle>
            <CardDescription>
              Выберите тип данных для импорта
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-type">Тип данных</Label>
              <Select
                value={importType}
                onValueChange={(value) => {
                  setImportType(value as ImportType);
                  handleClear();
                }}
              >
                <SelectTrigger id="import-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accruals">
                    📊 Начисления ОЗОН (ozon_accruals)
                  </SelectItem>
                  <SelectItem value="storage_costs">
                    📦 Стоимость размещения (storage_costs)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Период данных (для некоторых типов) */}
            {(importType === "accruals" || importType === "storage_costs") && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="period-start">Дата начала</Label>
                  <Input
                    id="period-start"
                    type="date"
                    value={formatDate(periodStart)}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="period-end">Дата окончания</Label>
                  <Input
                    id="period-end"
                    type="date"
                    value={formatDate(periodEnd)}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Загрузка файла */}
        <FileUploader
          importType={importType}
          onFileSelect={handleFileSelect}
          onClear={handleClear}
        />

        {/* Кнопка импорта */}
        {fileData && fileData.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Готово к импорту</p>
                  <p className="text-sm text-muted-foreground">
                    Найдено строк: {fileData.length}
                  </p>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  size="lg"
                >
                  <Database className="w-4 h-4 mr-2" />
                  {isImporting ? "Импорт..." : "Начать импорт"}
                </Button>
              </div>

              {isImporting && (
                <div className="mt-4 space-y-2">
                  <Progress value={importProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    {Math.round(importProgress)}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Результат импорта */}
        {importResult && (
          <Alert variant={importResult.failed > 0 ? "destructive" : "default"}>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Результат импорта</AlertTitle>
            <AlertDescription>
              <div className="space-y-2 mt-2">
                <p>
                  ✅ Успешно импортировано: <strong>{importResult.success}</strong>
                </p>
                {importResult.failed > 0 && (
                  <>
                    <p>
                      ❌ Ошибок: <strong>{importResult.failed}</strong>
                    </p>
                    {importResult.errors.length > 0 && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs max-h-40 overflow-y-auto">
                        {importResult.errors.slice(0, 10).map((error, i) => (
                          <p key={i}>{error}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* История импорта */}
        <ImportHistory />

        {/* Инструкция */}
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Инструкция по импорту</AlertTitle>
          <AlertDescription className="text-sm space-y-2 mt-2">
            <p>
              1. Выберите тип данных для импорта
            </p>
            <p>
              2. Загрузите Excel файл с данными (структура файла проверяется автоматически)
            </p>
            <p>
              3. Для начислений и размещения укажите период данных
            </p>
            <p>
              4. Нажмите "Начать импорт"
            </p>
            <p className="text-muted-foreground mt-2">
              ⚠️ Если товар не найден в базе по артикулу/SKU, будет автоматически запущена синхронизация с OZON API
            </p>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
};

export default ImportData;
