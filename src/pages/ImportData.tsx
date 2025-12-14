import { useState, useEffect } from "react";
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
import { parseNumber, parseDate as parseOzonDate } from "@/lib/importUtils";

// Безопасная очистка строки - только удаление BOM/zero-width/управляющих символов
const safeClean = (s: string): string => {
  return s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "") // только BOM/ZWSP/управляющие
    .trim();
};

// Нормализация для аналитики
const normalizeForAnalytics = (s: string): string => {
  return safeClean(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

const ImportData = () => {
  const [importType, setImportType] = useState<ImportType>("accruals");
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<string>(""); // Текущий статус импорта
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
    // САМОЕ РАННЕЕ логирование - должно появиться сразу при клике
    window.console.log("=".repeat(80));
    window.console.log("🚀🚀🚀 НАЧАЛО ИМПОРТА 🚀🚀🚀");
    window.console.log("=".repeat(80));
    window.console.log("Время запуска:", new Date().toISOString());
    
    // Показываем toast вместо alert
    toast({
      title: "Импорт запущен",
      description: "Откройте консоль (F12) для просмотра детальных логов",
    });
    
    if (!fileData || !marketplace) {
      window.console.error("❌ Ошибка: нет fileData или marketplace", { fileData: !!fileData, marketplace: !!marketplace });
      toast({
        title: "Ошибка",
        description: "Выберите файл и маркетплейс",
        variant: "destructive",
      });
      return;
    }
    
    // Валидация уже выполнена в FileUploader, продолжаем импорт

    window.console.log("📊 Информация о файле для импорта:", {
      importType,
      fileDataLength: fileData.length,
      marketplaceId: marketplace.id,
      periodStart,
      periodEnd,
      firstRowKeys: fileData.length > 0 ? Object.keys(fileData[0]).slice(0, 30) : [],
      firstRowSample: fileData.length > 0 ? Object.fromEntries(
        Object.entries(fileData[0]).slice(0, 20).map(([k, v]) => [k, String(v).substring(0, 100)])
      ) : null
    });
    
    // Оценка времени импорта
    const estimatedTime = Math.ceil(fileData.length / 1000); // Примерно 1 секунда на 1000 строк преобразования
    window.console.log(`⏱️ Оценочное время преобразования: ~${estimatedTime} секунд для ${fileData.length} строк`);

    setIsImporting(true);
    setImportProgress(0);
    setImportStatus("Инициализация импорта...");
    setImportResult(null);
    
    let importLog: any = null; // Объявляем здесь, чтобы использовать в catch

    try {
      // 1. Создаем лог импорта
      const { data: importLogData, error: logError } = await supabase
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
      
      importLog = importLogData; // Сохраняем для использования в catch
      
      window.console.log("✅ Лог импорта создан:", importLogData?.id);
      window.console.log("📊 Начинаем обработку файла...");
      
      setImportStatus("Преобразование данных...");

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // 2. Преобразуем все строки в объекты для вставки
      const BATCH_SIZE = 100; // Уменьшили размер батча, чтобы не перегружать браузер
      const transformedRows: any[] = [];

      // МАКСИМАЛЬНОЕ логирование первой строки для диагностики
      if (fileData.length > 0) {
        const firstRow = fileData[0];
        const firstRowKeys = Object.keys(firstRow);
        
        window.console.log("=".repeat(80));
        window.console.log("📊📊📊 ПЕРВАЯ СТРОКА ДАННЫХ (КРИТИЧЕСКАЯ ДИАГНОСТИКА) 📊📊📊");
        window.console.log("=".repeat(80));
        window.console.log("Все колонки в первой строке:", firstRowKeys);
        window.console.log("Количество колонок:", firstRowKeys.length);
        window.console.log("Первые 30 колонок:", firstRowKeys.slice(0, 30));
        window.console.log("Образец данных (первые 20 колонок):", Object.fromEntries(
          Object.entries(firstRow).slice(0, 20).map(([k, v]) => [k, String(v).substring(0, 100)])
        ));
        
        // Проверяем, есть ли колонки с похожими названиями
        const normalizedKeys = firstRowKeys.map(k => ({
          original: k,
          normalized: normalize(k),
          containsType: normalize(k).includes("тип"),
          containsNacisl: normalize(k).includes("начисл"),
          containsArtikul: normalize(k).includes("артикул"),
          // Показываем коды символов для диагностики проблем с кодировкой
          charCodes: k.split('').slice(0, 20).map(c => c.charCodeAt(0))
        }));
        
        const keysWithType = normalizedKeys.filter(k => k.containsType).map(k => k.original);
        const keysWithNacisl = normalizedKeys.filter(k => k.containsNacisl).map(k => k.original);
        const keysWithArtikul = normalizedKeys.filter(k => k.containsArtikul).map(k => k.original);
        
        window.console.log("Поиск похожих колонок:", {
          keysWithType,
          keysWithNacisl,
          keysWithArtikul,
          allNormalized: normalizedKeys.slice(0, 30)
        });
        
        // КРИТИЧЕСКОЕ: показываем alert если колонки не найдены
        if (keysWithType.length === 0 || keysWithArtikul.length === 0) {
          const message = `❌ КРИТИЧЕСКАЯ ОШИБКА: Не найдены обязательные колонки!\n\n` +
            `Найдено колонок с "тип": ${keysWithType.length}\n` +
            `Найдено колонок с "артикул": ${keysWithArtikul.length}\n\n` +
            `Первые 10 колонок в данных:\n${firstRowKeys.slice(0, 10).join('\n')}\n\n` +
            `Откройте консоль (F12) для полного списка и деталей.`;
          alert(message);
        }
        
        window.console.log("=".repeat(80));
      }

      // Логируем прогресс преобразования
      const totalRows = fileData.length;
      const logInterval = Math.max(1, Math.floor(totalRows / 100)); // Логируем каждые 1% или каждую строку для маленьких файлов
      const PROCESSING_BATCH = 1000; // Обрабатываем по 1000 строк за раз, затем делаем паузу
      
      window.console.log(`🔄 Начинаем преобразование ${totalRows} строк...`);
      window.console.log(`📊 Будем логировать каждые ${logInterval} строк`);
      window.console.log(`⏸️ Пауза каждые ${PROCESSING_BATCH} строк для предотвращения зависания браузера`);

      for (let i = 0; i < fileData.length; i++) {
        const row = fileData[i];
        
        // Делаем паузу каждые PROCESSING_BATCH строк, чтобы браузер не зависал
        if (i > 0 && i % PROCESSING_BATCH === 0) {
          const progress = ((i / totalRows) * 100).toFixed(1);
          window.console.log(`⏸️ Пауза после ${i} строк (${progress}%)...`);
          const progressPercent = (i / totalRows) * 50; // 50% - это преобразование, 50% - вставка
          setImportProgress(progressPercent);
          setImportStatus(`Преобразование данных: ${i + 1} / ${totalRows} строк (${progress}%)`);
          // Небольшая пауза, чтобы браузер мог обработать события
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Логируем прогресс
        if (i % logInterval === 0 || i < 10) {
          const progress = ((i / totalRows) * 100).toFixed(1);
          window.console.log(`📈 Прогресс преобразования: ${i + 1}/${totalRows} (${progress}%)`);
        }
        
        try {
          const transformed = transformRow(row, importType, marketplace.id, importLog?.id || "", i);
          transformedRows.push(transformed);
          
          // Логируем успешное преобразование первых 3 строк
          if (i < 3) {
            window.console.log(`✅ Строка ${i + 1} успешно преобразована:`, transformed);
          }
        } catch (error: any) {
          failedCount++;
          errors.push(`Строка ${i + 1}: ${error.message}`);
          
          // МАКСИМАЛЬНОЕ логирование для первых 5 ошибок
          if (i < 5) {
            window.console.error("=".repeat(80));
            window.console.error(`❌❌❌ ОШИБКА В СТРОКЕ ${i + 1} ❌❌❌`);
            window.console.error("=".repeat(80));
            window.console.error("Сообщение об ошибке:", error.message);
            window.console.error("Все ключи строки:", Object.keys(row));
            window.console.error("Количество ключей:", Object.keys(row).length);
            window.console.error("Образец данных строки:", Object.fromEntries(
              Object.entries(row).slice(0, 30).map(([k, v]) => [k, String(v).substring(0, 100)])
            ));
            
            // Пытаемся найти колонки вручную
            const rowKeys = Object.keys(row);
            const normalizedRowKeys = rowKeys.map(k => ({
              original: k,
              normalized: normalize(k),
              matchesType: normalize(k).includes("тип"),
              matchesNacisl: normalize(k).includes("начисл"),
              matchesArtikul: normalize(k).includes("артикул")
            }));
            
            window.console.error("Поиск колонок в строке:", {
              keysMatchingType: normalizedRowKeys.filter(k => k.matchesType).map(k => k.original),
              keysMatchingNacisl: normalizedRowKeys.filter(k => k.matchesNacisl).map(k => k.original),
              keysMatchingArtikul: normalizedRowKeys.filter(k => k.matchesArtikul).map(k => k.original),
              allNormalizedKeys: normalizedRowKeys.slice(0, 30)
            });
            
            window.console.error("=".repeat(80));
          }
          console.error(`Error transforming row ${i + 1}:`, error);
          
          // Останавливаем после первых 5 ошибок для диагностики (если нужно)
          // if (i >= 4) break;
        }
      }

      // 3. Вставляем данные батчами
      const tableName = importType === "accruals" ? "ozon_accruals" : "storage_costs";
      const totalBatches = Math.ceil(transformedRows.length / BATCH_SIZE);
      
      window.console.log(`📦 Начинаем вставку ${transformedRows.length} строк батчами по ${BATCH_SIZE}`);
      window.console.log(`📦 Всего батчей: ${totalBatches}`);
      
      setImportStatus("Вставка данных в базу...");

      for (let i = 0; i < transformedRows.length; i += BATCH_SIZE) {
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const chunk = transformedRows.slice(i, i + BATCH_SIZE);
        const progress = 50 + ((i + chunk.length) / fileData.length) * 50; // 50-100% для вставки
        
        setImportProgress(progress);
        setImportStatus(`Вставка данных: батч ${batchNumber}/${totalBatches} (${progress.toFixed(1)}%)`);
        
        window.console.log(`📦 Батч ${batchNumber}/${totalBatches}: вставляем строки ${i + 1}–${i + chunk.length} (${progress.toFixed(1)}%)`);

        try {
          // Добавляем задержку между батчами, чтобы избежать 429 ошибок
          if (batchNumber > 1) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100мс задержка между батчами
          }
          
          const { error } = await supabase.from(tableName).insert(chunk);

          if (error) {
            // Помечаем, что эти строки не удалось импортировать
            failedCount += chunk.length;
            errors.push(`Ошибка при вставке строк ${i + 1}–${i + chunk.length}: ${error.message}`);
            window.console.error(`❌ Ошибка в батче ${batchNumber}:`, error);
            
            // Если ошибка 429 (Too Many Requests), делаем большую паузу
            if (error.message?.includes('429') || error.code === 'PGRST429') {
              window.console.warn(`⚠️ Получена ошибка 429, делаем паузу 5 секунд...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            console.error(`Error inserting batch ${batchNumber}:`, error);
          } else {
            successCount += chunk.length;
            window.console.log(`✅ Батч ${batchNumber} успешно вставлен: ${chunk.length} строк`);
          }
        } catch (error: any) {
          failedCount += chunk.length;
          errors.push(`Ошибка при вставке строк ${i + 1}–${i + chunk.length}: ${error.message}`);
          window.console.error(`❌ Ошибка в батче ${batchNumber}:`, error);
          
          // Если ошибка 429, делаем большую паузу
          if (error.message?.includes('429') || error.status === 429) {
            window.console.warn(`⚠️ Получена ошибка 429, делаем паузу 5 секунд...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
          console.error(`Error inserting batch ${batchNumber}:`, error);
        }
      }
      
      window.console.log("=".repeat(80));
      window.console.log("✅ ИМПОРТ ЗАВЕРШЕН");
      window.console.log(`✅ Успешно: ${successCount}, Ошибок: ${failedCount}`);
      window.console.log("=".repeat(80));

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
        .eq("id", importLog?.id);

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
      window.console.error("=".repeat(80));
      window.console.error("❌❌❌ КРИТИЧЕСКАЯ ОШИБКА ИМПОРТА ❌❌❌");
      window.console.error("=".repeat(80));
      window.console.error("Ошибка:", error);
      window.console.error("Сообщение:", error.message);
      window.console.error("Стек:", error.stack);
      window.console.error("=".repeat(80));
      console.error("Import error:", error);
      
      // Обновляем лог импорта с ошибкой
      try {
        await supabase
          .from("import_logs")
          .update({
            status: "failed",
            error_message: error.message || "Неизвестная ошибка",
            completed_at: new Date().toISOString(),
          })
          .eq("id", importLog?.id);
      } catch (updateError) {
        window.console.error("Не удалось обновить лог импорта:", updateError);
      }
      
      toast({
        title: "Ошибка импорта",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      window.console.log("🏁 Импорт завершен (finally блок)");
      setIsImporting(false);
      setImportStatus("");
      setImportProgress(0);
      window.console.log("✅ Состояние установлено: isImporting=false");
    }
  };

  // Вспомогательные функции для парсинга
  
  
  // Преобразование строки начислений ОЗОН в объект для вставки (использует маппинг)
  const buildAccrualRow = (
    row: any,
    marketplaceId: string,
    importBatchId: string
  ) => {
    // Используем фиксированные имена колонок из шаблона
    const accrualTypeRaw = row["Тип начисления"] || row["Тип начисления_raw"] || "";
    const accrualTypeNorm = row["Тип начисления_norm"] || normalizeForAnalytics(accrualTypeRaw);
    const offerId = row["Артикул"];
    const date = row["Дата начисления"];
    
    if (!accrualTypeRaw || !offerId) {
      throw new Error(`Пустые значения в обязательных полях: accrual_type="${accrualTypeRaw}", offer_id="${offerId}"`);
    }

    return {
      marketplace_id: marketplaceId,
      accrual_date: parseOzonDate(date, periodStart) || periodStart || null,
      offer_id: safeClean(String(offerId || "")),
      sku: row["SKU"] ? safeClean(String(row["SKU"])) : null,
      accrual_type: accrualTypeNorm,
      accrual_type_raw: accrualTypeRaw,
      accrual_type_norm: accrualTypeNorm,
      quantity: parseNumber(row["Количество"] || 0),
      amount_before_commission: parseNumber(row["За продажу или возврат до вычета комиссий и услуг"] || 0),
      total_amount: parseNumber(row["Итого, руб."] || 0),
      shipment_number: row["Номер отправления или идентификатор услуги"] ? safeClean(String(row["Номер отправления или идентификатор услуги"])) : null,
      order_date: row["Дата принятия заказа в обработку или оказания услуги"] ? parseOzonDate(row["Дата принятия заказа в обработку или оказания услуги"]) : null,
      warehouse: row["Склад отгрузки"] ? safeClean(String(row["Склад отгрузки"])) : null,
      product_name: row["Название товара или услуги"] ? safeClean(String(row["Название товара или услуги"])) : null,
      commission_percent: parseNumber(row["Вознаграждение Ozon, %"] || 0),
      commission_amount: parseNumber(row["Вознаграждение Ozon"] || 0),
      order_assembly: parseNumber(row["Сборка заказа"] || 0),
      shipment_processing: parseNumber(row["Обработка отправления (Drop-off/Pick-up) (разбивается по товарам пропорционально количеству в отправлении)"] || 0),
      main_route: parseNumber(row["Магистраль"] || 0),
      last_mile: parseNumber(row["Последняя миля (разбивается по товарам пропорционально доле цены товара в сумме отправления)"] || 0),
      return_main_route: parseNumber(row["Обратная магистраль"] || 0),
      return_processing: parseNumber(row["Обработка возврата"] || 0),
      cancelled_processing: parseNumber(row["Обработка отмененного или невостребованного товара (разбивается по товарам в отправлении в одинаковой пропорции)"] || 0),
      undelivered_processing: parseNumber(row["Обработка невыкупленного товара"] || 0),
      logistics: parseNumber(row["Логистика"] || 0),
      localization_index: row["Индекс локализации"] ? safeClean(String(row["Индекс локализации"])) : null,
      avg_delivery_hours: row["Среднее время доставки, часы"] ? parseInt(String(row["Среднее время доставки, часы"])) || 0 : null,
      return_logistics: parseNumber(row["Обратная логистика"] || 0),
      import_batch_id: importBatchId,
    };
  };
  
  // Преобразование строки стоимости размещения в объект для вставки
  const buildStorageCostRow = (
    row: any,
    marketplaceId: string,
    importBatchId: string
  ) => {
    // Используем фиксированные имена колонок из шаблона
    const date = row["Дата"];
    const offerId = row["Артикул"];
    
    if (!date || !offerId) {
      throw new Error(`Пустые значения в обязательных полях: date="${date}", offer_id="${offerId}"`);
    }

    return {
      marketplace_id: marketplaceId,
      cost_date: parseOzonDate(date, periodStart) || periodStart,
      offer_id: safeClean(String(offerId || "")),
      sku: row["SKU"] ? safeClean(String(row["SKU"])) : null,
      storage_cost: parseNumber(row["Начисленная стоимость размещения"] || 0),
      stock_quantity: parseInt(String(row["Кол-во экземпляров"] || 0)) || 0,
      category: row["Категория товара"] ? safeClean(String(row["Категория товара"])) : null,
      descriptive_type: row["Описательный тип"] ? safeClean(String(row["Описательный тип"])) : null,
      warehouse: row["Склад"] ? safeClean(String(row["Склад"])) : null,
      product_attribute: row["Признак товара"] ? safeClean(String(row["Признак товара"])) : null,
      total_volume_ml: parseInt(String(row["Суммарный объем в миллилитрах"] || 0)) || 0,
      paid_volume_ml: parseInt(String(row["Платный объем в миллилитрах"] || 0)) || 0,
      paid_instances: parseInt(String(row["Кол-во платных экземпляров"] || 0)) || 0,
      import_batch_id: importBatchId,
    };
  };
  
  // Преобразование строки в объект для вставки
  const transformRow = (
    row: any,
    type: ImportType,
    marketplaceId: string,
    importBatchId: string,
    rowIndex?: number
  ) => {
    if (rowIndex !== undefined && rowIndex < 5) {
      window.console.log(`🔄 transformRow вызван для строки ${rowIndex}:`, {
        type,
        rowKeys: Object.keys(row).slice(0, 30),
        rowSample: Object.fromEntries(
          Object.entries(row)
            .slice(0, 15)
            .map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
      });
    }

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
                  <div className="flex items-center justify-between text-sm">
                    <p className="text-muted-foreground">
                      {importStatus || `Прогресс: ${Math.round(importProgress)}%`}
                    </p>
                    <p className="font-medium">
                      {Math.round(importProgress)}%
                    </p>
                  </div>
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
