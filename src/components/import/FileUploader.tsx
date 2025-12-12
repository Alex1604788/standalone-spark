import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { ColumnMappingModal, guessMapping, type ColumnMapping } from "./ColumnMappingModal";
import { normalize } from "@/lib/importUtils";

export type ImportType = "accruals" | "storage_costs";

interface FileUploaderProps {
  importType: ImportType;
  onFileSelect: (data: any[], fileName: string, columnMapping?: Record<string, string>) => void;
  onClear?: () => void;
}

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  accruals: "Начисления ОЗОН",
  storage_costs: "Стоимость размещения",
};

const EXPECTED_COLUMNS: Record<ImportType, string[]> = {
  accruals: ["Тип начисления", "Артикул"],
  storage_costs: ["Дата", "Артикул"],
};

export const FileUploader = ({
  importType,
  onFileSelect,
  onClear,
}: FileUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [fileColumns, setFileColumns] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [initialMapping, setInitialMapping] = useState<ColumnMapping>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name.substring(file.name.lastIndexOf("."));
    if (!validExtensions.includes(fileExtension.toLowerCase())) {
      toast({
        title: "Неверный формат файла",
        description: "Поддерживаются только файлы Excel (.xlsx, .xls)",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setIsProcessing(true);

    try {
      // 1. читаем файл
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      if (!workbook.SheetNames.length) {
        throw new Error("В файле нет листов");
      }

      // 2. берём первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 3. Сначала читаем как массив массивов, чтобы найти строку с заголовками
      const rawData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: "" 
      }) as any[][];

      if (rawData.length === 0) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // 4. Ищем строку с заголовками (для начислений ОЗОН ищем "Тип начисления" и "Артикул")
      let headerRowIndex = -1;
      
      if (importType === "accruals") {
        // ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ первой строки
        if (rawData.length > 0) {
          const firstRow = rawData[0];
          window.console.log("=".repeat(80));
          window.console.log("🔍 ПРОВЕРКА ПЕРВОЙ СТРОКИ (ШАПКА ТАБЛИЦЫ)");
          window.console.log("=".repeat(80));
          window.console.log("Первая строка (сырые данные):", firstRow);
          window.console.log("Первая строка (первые 20 ячеек):", firstRow.slice(0, 20));
          
          const firstRowValues = firstRow.map(cell => String(cell || "").trim());
          window.console.log("Первая строка (как строки, первые 20):", firstRowValues.slice(0, 20));
          
          const firstRowNormalized = firstRowValues.map(v => normalize(v));
          window.console.log("Первая строка (нормализованные, первые 20):", firstRowNormalized.slice(0, 20));
          
          // Ищем "тип начисления" - может быть в одной ячейке или в разных
          const hasAccrualType = firstRowNormalized.some(v => {
            const result = v === "тип начисления" || (v.includes("тип") && v.includes("начисл"));
            if (result) {
              window.console.log(`✅ Найдено "тип начисления" в значении: "${v}"`);
            }
            return result;
          });
          
          const hasOfferId = firstRowNormalized.some(v => {
            const result = v === "артикул" || v.includes("артикул");
            if (result) {
              window.console.log(`✅ Найдено "артикул" в значении: "${v}"`);
            }
            return result;
          });
          
          window.console.log("Результаты проверки первой строки:", {
            hasAccrualType,
            hasOfferId,
            isHeader: hasAccrualType && hasOfferId
          });
          window.console.log("=".repeat(80));
          
          if (hasAccrualType && hasOfferId) {
            headerRowIndex = 0;
            window.console.log("✅ Первая строка содержит заголовки!");
          }
        }
        
        // Если первая строка не подошла, ищем в следующих строках
        if (headerRowIndex === -1) {
          for (let i = 1; i < Math.min(20, rawData.length); i++) {
            const row = rawData[i];
            if (!row || row.every(cell => !cell || String(cell).trim() === "")) {
              continue;
            }
            
            const rowValues = row.map(cell => normalize(String(cell || ""))).filter(v => v.length > 0);
            if (rowValues.length < 2) continue;
            
            // Ищем "тип начисления" и "артикул"
            const hasAccrualType = rowValues.some(v => v === "тип начисления" || (v.includes("тип") && v.includes("начисл")));
            const hasOfferId = rowValues.some(v => v === "артикул" || v.includes("артикул"));
            
            if (hasAccrualType && hasOfferId) {
              headerRowIndex = i;
              window.console.log(`✅ Найдена строка с заголовками на индексе ${i}`);
              break;
            }
          }
        }
      } else {
        // Для других типов используем первую непустую строку
        headerRowIndex = rawData.findIndex(row =>
          row && row.some(cell => String(cell ?? "").trim() !== "")
        );
      }

      // 5. Если заголовки не найдены, используем первую строку (fallback)
      if (headerRowIndex === -1) {
        window.console.warn("⚠️ Заголовки не найдены, используем первую строку как fallback");
        headerRowIndex = 0;
      }

      // 6. Берем заголовки из найденной строки
      const headerRow = rawData[headerRowIndex];
      const headers = headerRow.map((cell, idx) => {
        const val = String(cell || `Column${idx + 1}`).trim();
        return val || `Column${idx + 1}`;
      });
      
      // 7. Читаем данные начиная со следующей строки после заголовков
      const dataRows = rawData.slice(headerRowIndex + 1);
      
      // 8. Преобразуем в объекты с использованием заголовков
      const jsonData = dataRows
        .filter(row => row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ""))
        .map(row => {
          const obj: Record<string, any> = {};
          headers.forEach((header, idx) => {
            obj[header] = row[idx] !== undefined ? row[idx] : "";
          });
          return obj;
        });
      
      window.console.log(`✅ Использованы заголовки из строки ${headerRowIndex}:`, headers.slice(0, 20));
      window.console.log(`✅ Всего заголовков: ${headers.length}`);
      window.console.log(`✅ Найдено строк данных: ${jsonData.length}`);

      if (!jsonData.length) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // 4. просто логируем колонки для себя, НО не блокируем импорт
      const firstRow = jsonData[0] as Record<string, any>;
      const fileColumns = Object.keys(firstRow);

      console.log("📄 FileUploader: загружен файл", {
        importType,
        fileName: file.name,
        sheet: firstSheetName,
        columns: fileColumns,
        firstRowSample: Object.fromEntries(
          Object.entries(firstRow)
            .slice(0, 10)
            .map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
      });

      // 4. Проверяем обязательные колонки и делаем автодетект
      window.console.log("🔍 Начинаем автодетект маппинга колонок...");
      window.console.log("📋 Доступные колонки в файле:", fileColumns.slice(0, 20));
      
      const guessedMapping = guessMapping(importType, fileColumns);
      window.console.log("🎯 Результат автодетекта:", guessedMapping);
      
      // Проверяем, найдены ли все обязательные поля
      const requiredFields = importType === "accruals" 
        ? ["accrual_type", "offer_id", "date"]
        : ["offer_id", "date"];
      
      window.console.log("📌 Обязательные поля для типа", importType, ":", requiredFields);
      
      const missingRequiredFields = requiredFields.filter(field => !guessedMapping[field]);
      window.console.log("❌ Не найдены обязательные поля:", missingRequiredFields);
      
      if (missingRequiredFields.length > 0) {
        // Не все обязательные поля найдены - показываем модалку
        window.console.log("⚠️ Не все обязательные колонки найдены автоматически, открываем модалку настройки");
        window.console.log("📝 Найденные колонки:", fileColumns);
        window.console.log("📝 Предварительный маппинг:", guessedMapping);
        setFileColumns(fileColumns);
        setParsedData(jsonData);
        setFileName(file.name);
        setInitialMapping(guessedMapping);
        setShowMappingModal(true);
        setIsProcessing(false);
        return;
      }

      // Все обязательные поля найдены - используем автодетект
      window.console.log("✅ Все обязательные колонки найдены автоматически:", guessedMapping);
      
      toast({
        title: "Файл загружен",
        description: `Найдено строк: ${jsonData.length}. Колонки сопоставлены автоматически.`,
      });

      // 5. отдаём данные дальше с маппингом
      onFileSelect(jsonData, file.name, guessedMapping);
    } catch (error: any) {
      console.error("❌ ОШИБКА при парсинге Excel в FileUploader:", error);
      toast({
        title: "Ошибка при чтении файла",
        description: error?.message || "Не удалось прочитать Excel файл",
        variant: "destructive",
      });
      setSelectedFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClear?.();
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        {!selectedFile ? (
          <div
            onClick={handleClick}
            className="border-2 border-dashed border-muted hover:border-primary rounded-lg p-8 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              Загрузить {IMPORT_TYPE_LABELS[importType]}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Нажмите для выбора Excel файла или перетащите файл сюда
            </p>
            <p className="text-xs text-muted-foreground">
              Поддерживаются форматы: .xlsx, .xls
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 border border-primary rounded-lg bg-primary/5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-8 h-8 text-primary" />
              <div>
                <p className="font-semibold">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                  {isProcessing && " • Обработка..."}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClear}
              disabled={isProcessing}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-semibold mb-2">Ожидаемые колонки:</p>
          <p className="text-xs text-muted-foreground">
            {EXPECTED_COLUMNS[importType].join(", ")}
          </p>
        </div>
      </CardContent>
      
      {/* Модалка настройки колонок */}
      <ColumnMappingModal
        open={showMappingModal}
        onClose={() => {
          setShowMappingModal(false);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
        onSave={(mapping) => {
          setShowMappingModal(false);
          toast({
            title: "Колонки настроены",
            description: "Импорт готов к запуску",
          });
          onFileSelect(parsedData, fileName, mapping);
        }}
        importType={importType}
        fileColumns={fileColumns}
        initialMapping={initialMapping}
      />
    </Card>
  );
};
