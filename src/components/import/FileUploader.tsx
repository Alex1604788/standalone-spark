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

/**
 * Ozon/Excel иногда отдает строки в виде "䄀爀琀椀欀甀氀",
 * что на самом деле UTF-16LE ASCII (A r t i k u l), прочитанный неправильно.
 * Преобразуем такие строки обратно в нормальный ASCII.
 */
const fixWeirdUtf16 = (s: string): string => {
  if (!s) return s;

  const codes = Array.from(s).map((ch) => ch.charCodeAt(0));

  // считаем, сколько символов имеют вид 0xXX00 (ASCII, сдвинутый в старший байт)
  const beAsciiCount = codes.filter((c) => {
    const low = c & 0xff;
    const high = c >> 8;
    return low === 0 && high >= 0x20 && high <= 0x7e;
  }).length;

  // если таких >= 60% — считаем, что это как раз тот случай
  if (beAsciiCount >= Math.max(1, Math.round(codes.length * 0.6))) {
    const fixedCodes = codes.map((c) => {
      const low = c & 0xff;
      const high = c >> 8;
      if (low === 0 && high >= 0x20 && high <= 0x7e) {
        return high; // ASCII код
      }
      return c;
    });
    return String.fromCharCode(...fixedCodes);
  }

  return s;
};

/**
 * Удаляем BOM, zero-width, управляющие символы,
 * нормализуем пробелы и регистр — для поиска.
 */
const normalizeForSearch = (s: string) =>
  fixWeirdUtf16(s)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Чистим заголовок для использования в качестве ключа объекта.
 */
const cleanHeaderKey = (s: string) =>
  fixWeirdUtf16(s)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
    .trim();

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

      // пробуем более "безопасное" чтение через Uint8Array
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, {
        type: "array",
      });

      if (!workbook.SheetNames.length) {
        throw new Error("В файле нет листов");
      }

      // 2. берём первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 3. Получаем сырые данные как массив массивов (header: 1)
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as any[][];

      if (!rawData.length) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // 4. OZON: заголовки всегда в первой строке
      const headerRowIndex = 0;

      // 5. Извлекаем заголовки напрямую из ячеек Excel (более надежно)
      const headerRow = rawData[headerRowIndex] || [];
      const originalHeaders: string[] = [];
      
      // Ограничиваем колонки по фактической ширине headerRow
      const maxCols = headerRow.length; // фактическая ширина заголовков
      
      // Читаем заголовки напрямую из ячеек Excel
      for (let col = 0; col < maxCols; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
        const cell = worksheet[cellAddress];
        let headerValue = "";
        
        if (cell) {
          // Приоритет: w (formatted text) > v (value) > t (type)
          if (cell.w) {
            // w - это отформатированная строка, как она видна в Excel
            headerValue = String(cell.w);
          } else if (cell.v != null) {
            // v - это значение ячейки
            headerValue = String(cell.v);
          } else if (cell.t === 's' && cell.v != null) {
            // Если это строка в shared strings
            headerValue = String(cell.v);
          }
        }
        
        // Если из ячейки ничего не получили, берем из rawData
        if (!headerValue && headerRow[col] != null) {
          headerValue = String(headerRow[col] || "").trim();
        }
        
        originalHeaders.push(headerValue);
      }

      // 6. Чистим заголовки от BOM/невидимых символов и utf16-кракозябр
      const cleanedHeaders = originalHeaders.map(header => {
        const cleaned = cleanHeaderKey(header);
        // Если после очистки осталась пустая строка или только цифры, оставляем оригинал
        if (!cleaned || /^\d+$/.test(cleaned)) {
          return header.trim() || cleaned;
        }
        return cleaned;
      });

      window.console.log("📋 Оригинальные заголовки:", originalHeaders.slice(0, 10));
      window.console.log("📋 Очищенные заголовки:", cleanedHeaders.slice(0, 10));

      // 6.1. Делаем правильный список колонок: брать только реальные заголовки (без пустых/мусорных)
      const fileColumns = cleanedHeaders
        .map(h => (h || "").trim())
        .filter(h => h.length > 0 && !/^\d+$/.test(h));

      // 7. Преобразуем данные в JSON с правильными заголовками
      const jsonData: any[] = [];
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!Array.isArray(row)) continue;
        
        const rowObj: Record<string, any> = {};
        for (let j = 0; j < cleanedHeaders.length; j++) {
          const header = cleanedHeaders[j];
          if (!header) continue; // Пропускаем пустые заголовки
          
          let value = row[j];
          if (value == null || value === "") {
            value = "";
          } else if (typeof value === "string") {
            value = fixWeirdUtf16(
              value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
            );
          }
          rowObj[header] = value;
        }
        
        // Добавляем только непустые строки
        if (Object.values(rowObj).some(v => v !== "" && v != null)) {
          jsonData.push(rowObj);
        }
      }

      // fileColumns уже определен выше (6.1)

      const firstRow = jsonData[0] || {};

      console.log("📄 FileUploader: загружен файл", {
        importType,
        fileName: file.name,
        sheet: firstSheetName,
        originalColumns: originalHeaders,
        cleanedColumns: fileColumns,
        sampleRow: Object.fromEntries(
          Object.entries(firstRow)
            .slice(0, 10)
            .map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
      });

      // Диагностический вывод
      window.console.log("✅ fileColumns (первые 30):", fileColumns.slice(0, 30));
      
      // 4. Проверяем обязательные колонки и делаем автодетект
      window.console.log("🔍 Начинаем автодетект маппинга колонок...");
      window.console.log("📋 Доступные колонки в файле:", fileColumns.slice(0, 20));
      
      const guessedMapping = guessMapping(importType, fileColumns);
      window.console.log("✅ guessedMapping:", guessedMapping);
      
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
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
