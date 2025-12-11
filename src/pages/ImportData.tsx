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

      // 2. Преобразуем все строки в объекты для вставки
      const BATCH_SIZE = 500;
      const transformedRows: any[] = [];

      for (let i = 0; i < fileData.length; i++) {
        const row = fileData[i];
        try {
          const transformed = transformRow(row, importType, marketplace.id, importLog.id);
          transformedRows.push(transformed);
        } catch (error: any) {
          failedCount++;
          errors.push(`Строка ${i + 1}: ${error.message}`);
          console.error(`Error transforming row ${i + 1}:`, error);
        }
      }

      // 3. Вставляем данные батчами
      const tableName = importType === "accruals" ? "ozon_accruals" : "storage_costs";

      for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
        const chunk = transformedRows.slice(i, i + BATCH_SIZE);
        setImportProgress(((i + chunk.length) / fileData.length) * 100);

        try {
          const { error } = await supabase.from(tableName).insert(chunk);

          if (error) {
            // Помечаем, что эти строки не удалось импортировать
            failedCount += chunk.length;
            errors.push(`Ошибка при вставке строк ${i + 1}–${i + chunk.length}: ${error.message}`);
            console.error(`Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
          } else {
            successCount += chunk.length;
          }
        } catch (error: any) {
          failedCount += chunk.length;
          errors.push(`Ошибка при вставке строк ${i + 1}–${i + chunk.length}: ${error.message}`);
          console.error(`Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
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

  // Вспомогательные функции для парсинга
  
  // Нормализация строки для поиска колонок
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  
  // Улучшенный поиск колонок
  const findColumn = (row: any, keywords: string[]) => {
    const normalizedKeywords = keywords.map(normalize);
    const keys = Object.keys(row);
    return keys.find(k => {
      const nk = normalize(k);
      return normalizedKeywords.some(kw => nk.includes(kw));
    });
  };
  
  // Парсинг чисел (убирает пробелы, обрабатывает запятые)
  const toNumber = (val: any): number => {
    if (val == null || val === "") return 0;
    const normalized = String(val)
      .replace(/\s/g, "")     // убираем пробелы и неразрывные
      .replace(",", ".");
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
  };
  
  // Парсинг дат OZON (Excel serial, формат DD.MM.YYYY)
  const parseOzonDate = (raw: any, fallback?: string): string | null => {
    if (!raw && !fallback) return null;
    if (!raw && fallback) return fallback;

    if (typeof raw === "number") {
      // Excel serial (примерно): 25569 = 1970-01-01
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
      return date.toISOString().split("T")[0];
    }

    const str = String(raw).trim();

    // Формат 01.10.2025
    const m = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm}-${dd}`;
    }

    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }

    return fallback || null;
  };
  
  // Преобразование строки начислений ОЗОН в объект для вставки
  const buildAccrualRow = (
    row: any,
    marketplaceId: string,
    importBatchId: string
  ) => {
    const accrualTypeCol = findColumn(row, ["тип начисления", "тип"]);
    const offerIdCol = findColumn(row, ["артикул"]);
    const skuCol = findColumn(row, ["sku", "ску"]);
    const quantityCol = findColumn(row, ["количество"]);
    const amountBeforeCol = findColumn(row, ["до вычета", "до комиссии", "продажа"]);
    const totalCol = findColumn(row, ["итого", "сумма"]);
    const dateCol = findColumn(row, ["дата"]);

    if (!accrualTypeCol || !offerIdCol) {
      throw new Error("Не найдены обязательные колонки: Тип начисления, Артикул");
    }

    return {
      marketplace_id: marketplaceId,
      accrual_date: parseOzonDate(dateCol ? row[dateCol] : null, periodStart),
      offer_id: String(row[offerIdCol] || "").trim(),
      sku: skuCol ? String(row[skuCol] || "").trim() : null,
      accrual_type: String(row[accrualTypeCol] || "").trim(),
      quantity: quantityCol ? toNumber(row[quantityCol]) : 0,
      amount_before_commission: amountBeforeCol ? toNumber(row[amountBeforeCol]) : 0,
      total_amount: totalCol ? toNumber(row[totalCol]) : 0,
      import_batch_id: importBatchId,
    };
  };
  
  // Преобразование строки стоимости размещения в объект для вставки
  const buildStorageCostRow = (
    row: any,
    marketplaceId: string,
    importBatchId: string
  ) => {
    const dateCol = findColumn(row, ["дата"]);
    const offerIdCol = findColumn(row, ["артикул"]);
    const skuCol = findColumn(row, ["sku", "ску"]);
    const costCol = findColumn(row, ["стоимость размещения", "стоимость", "размещение"]);
    const stockCol = findColumn(row, ["остаток", "количество", "экземпляр"]);

    if (!dateCol || !offerIdCol) {
      throw new Error("Не найдены обязательные колонки: Дата, Артикул");
    }

    return {
      marketplace_id: marketplaceId,
      cost_date: parseOzonDate(row[dateCol]) || periodStart,
      offer_id: String(row[offerIdCol] || "").trim(),
      sku: skuCol ? String(row[skuCol] || "").trim() : null,
      storage_cost: costCol ? toNumber(row[costCol]) : 0,
      stock_quantity: stockCol ? toNumber(row[stockCol]) : 0,
      import_batch_id: importBatchId,
    };
  };
  
  // Преобразование строки в объект для вставки (обертка)
  const transformRow = (
    row: any,
    type: ImportType,
    marketplaceId: string,
    importBatchId: string
  ) => {
    if (type === "accruals") {
      return buildAccrualRow(row, marketplaceId, importBatchId);
    }
    return buildStorageCostRow(row, marketplaceId, importBatchId);
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
