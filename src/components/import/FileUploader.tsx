import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export type ImportType = "accruals" | "storage_costs";

interface FileUploaderProps {
  importType: ImportType;
  onFileSelect: (data: any[], fileName: string) => void;
  onClear?: () => void;
}

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  accruals: "Начисления ОЗОН",
  storage_costs: "Стоимость размещения",
};

const EXPECTED_COLUMNS: Record<ImportType, string[]> = {
  accruals: ["Тип начисления", "Артикул"],  // Минимальные требования
  storage_costs: ["Дата", "Артикул"],
};

export const FileUploader = ({ importType, onFileSelect, onClear }: FileUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log("🚀 handleFileChange вызвана", { importType });
    const file = event.target.files?.[0];
    if (!file) {
      console.log("❌ Файл не выбран");
      return;
    }

    console.log("📁 Выбран файл:", { name: file.name, size: file.size, type: file.type });

    // Проверка расширения
    const validExtensions = [".xlsx", ".xls"];
    const fileExtension = file.name.substring(file.name.lastIndexOf("."));
    if (!validExtensions.includes(fileExtension.toLowerCase())) {
      console.log("❌ Неверное расширение файла:", fileExtension);
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
      console.log("📖 Начинаем чтение файла...");
      // Парсинг Excel файла
      const arrayBuffer = await file.arrayBuffer();
      console.log("📖 Файл прочитан, размер:", arrayBuffer.byteLength);
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      console.log("📖 Workbook создан, листы:", workbook.SheetNames);

      // Берем первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Сначала читаем как массив массивов, чтобы найти строку с заголовками
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

      // Функция для нормализации значения
      const normalizeValue = (val: any): string => {
        if (val === null || val === undefined) return "";
        return String(val).trim().toLowerCase();
      };

      // Функция для проверки, является ли строка заголовками
      const isHeaderRow = (row: any[]): boolean => {
        const rowValues = row.map(normalizeValue).filter(v => v && v.length > 0);
        if (rowValues.length < 2) return false;
        
        // Проверяем наличие ключевых слов для начислений ОЗОН
        if (importType === "accruals") {
          // Ищем "тип начисления" или комбинацию "тип" + "начисл"
          const hasAccrualType = rowValues.some(v => {
            const normalized = v.toLowerCase();
            return normalized.includes("тип начисления") || 
                   (normalized.includes("тип") && normalized.includes("начисл"));
          });
          // Ищем "артикул"
          const hasOfferId = rowValues.some(v => 
            v.toLowerCase().includes("артикул")
          );
          
          console.log(`🔍 Проверка строки на заголовки:`, {
            rowValues: rowValues.slice(0, 10),
            hasAccrualType,
            hasOfferId,
            isHeader: hasAccrualType && hasOfferId
          });
          
          return hasAccrualType && hasOfferId;
        }
        
        // Для других типов проверяем наличие ожидаемых колонок
        const expectedColumns = EXPECTED_COLUMNS[importType];
        return expectedColumns.some(col => 
          rowValues.some(v => {
            const normalizedCol = normalizeValue(col);
            return normalizedCol === v || v.includes(normalizedCol);
          })
        );
      };

      // Ищем строку с заголовками (проверяем первые 30 строк, пропуская пустые)
      let headerRowIndex = -1;
      console.log("🔍 Поиск строки с заголовками. Всего строк в файле:", rawData.length);
      console.log("🔍 Первые 5 строк файла:", rawData.slice(0, 5).map((row, idx) => ({
        index: idx,
        row: row.slice(0, 10).map(cell => String(cell).substring(0, 30))
      })));
      
      // Сначала ищем точное совпадение
      for (let i = 0; i < Math.min(30, rawData.length); i++) {
        const row = rawData[i];
        // Пропускаем полностью пустые строки
        if (!row || row.every(cell => !cell || String(cell).trim() === "")) {
          continue;
        }
        
        if (isHeaderRow(row)) {
          headerRowIndex = i;
          console.log(`✅ Найдена строка с заголовками на индексе ${i}:`, row.slice(0, 15).map(cell => String(cell).substring(0, 50)));
          break;
        }
      }

      // Если не нашли точное совпадение, ищем по частичным совпадениям
      if (headerRowIndex === -1) {
        console.warn("⚠️ Не найдена строка с точными заголовками, ищем по частичным совпадениям");
        for (let i = 0; i < Math.min(30, rawData.length); i++) {
          const row = rawData[i];
          if (!row || row.every(cell => !cell || String(cell).trim() === "")) {
            continue;
          }
          
          const rowValues = row.map(normalizeValue).filter(v => v && v.length > 0);
          if (rowValues.length < 5) continue;
          
          // Для начислений ОЗОН ищем хотя бы одно из ключевых слов
          if (importType === "accruals") {
            const hasAccrualType = rowValues.some(v => 
              v.includes("тип") || v.includes("начисл")
            );
            const hasOfferId = rowValues.some(v => v.includes("артикул"));
            
            if (hasAccrualType || hasOfferId) {
              headerRowIndex = i;
              console.log(`⚠️ Найдена строка ${i} с частичными совпадениями:`, row.slice(0, 15).map(cell => String(cell).substring(0, 50)));
              break;
            }
          }
        }
      }

      // Если все еще не нашли, используем первую непустую строку с достаточным количеством колонок
      if (headerRowIndex === -1) {
        console.warn("⚠️ Не найдена строка с заголовками, ищем первую строку с данными");
        for (let i = 0; i < Math.min(30, rawData.length); i++) {
          const row = rawData[i];
          if (!row) continue;
          
          const nonEmptyCells = row.filter(cell => {
            const val = normalizeValue(cell);
            return val.length > 0 && !/^\d+$/.test(val) && !/^[0-9\s\-\.]+$/.test(val); // Не только цифры и даты
          });
          if (nonEmptyCells.length >= 3) {
            headerRowIndex = i;
            console.log(`⚠️ Используем строку ${i} как заголовки (не найдены точные совпадения):`, row.slice(0, 15).map(cell => String(cell).substring(0, 50)));
            break;
          }
        }
        
        // Если все еще не нашли, используем первую строку
        if (headerRowIndex === -1) {
          headerRowIndex = 0;
          console.warn("⚠️ Используем первую строку как заголовки (последний вариант)");
        }
      }

      // Конвертируем в JSON, используя найденную строку как заголовки
      // Если нашли строку с заголовками, используем её явно
      let jsonData: any[];
      
      if (headerRowIndex >= 0) {
        // Берем заголовки из найденной строки
        const headerRow = rawData[headerRowIndex];
        const headers = headerRow.map((cell, idx) => {
          const val = String(cell || `Column${idx + 1}`).trim();
          return val || `Column${idx + 1}`;
        });
        
        // Читаем данные начиная со следующей строки после заголовков
        const dataRows = rawData.slice(headerRowIndex + 1);
        
        // Преобразуем в объекты с использованием заголовков
        jsonData = dataRows
          .filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ""))
          .map(row => {
            const obj: Record<string, any> = {};
            headers.forEach((header, idx) => {
              obj[header] = row[idx] !== undefined ? row[idx] : "";
            });
            return obj;
          });
        
        console.log(`✅ Использованы заголовки из строки ${headerRowIndex}:`, headers.slice(0, 20));
        console.log(`✅ Всего заголовков: ${headers.length}`);
        console.log(`✅ Найдено строк данных: ${jsonData.length}`);
      } else {
        // Fallback: используем стандартный парсинг
        jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          defval: "",
        });
      }

      if (jsonData.length === 0) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // Валидация колонок
      const firstRow = jsonData[0] as Record<string, any>;
      const fileColumns = Object.keys(firstRow);
      const expectedColumns = EXPECTED_COLUMNS[importType];

      // Нормализация для сравнения (регистронезависимо, без лишних пробелов)
      const normalizeColumn = (col: string) => col.trim().toLowerCase();
      
      // Функция поиска колонки по ключевым словам (как в ImportData.tsx)
      const findColumn = (keywords: string[]) => {
        return fileColumns.find((fc) => 
          keywords.some((kw) => 
            normalizeColumn(fc).includes(normalizeColumn(kw))
          )
        );
      };

      // Проверка обязательных колонок с использованием ключевых слов
      const missingColumns: string[] = [];
      
      if (importType === "accruals") {
        // Для начислений ОЗОН ищем по ключевым словам
        const accrualTypeCol = findColumn(["тип начисления", "тип"]);
        const offerIdCol = findColumn(["артикул"]);
        
        if (!accrualTypeCol) missingColumns.push("Тип начисления");
        if (!offerIdCol) missingColumns.push("Артикул");
      } else {
        // Для других типов используем стандартную проверку
        const missing = expectedColumns.filter(
          (col) => !fileColumns.some((fc) => 
            normalizeColumn(fc).includes(normalizeColumn(col))
          )
        );
        missingColumns.push(...missing);
      }

      // Логирование для отладки
      console.log("🔍 Проверка колонок файла:", {
        headerRowIndex,
        fileColumns: fileColumns.slice(0, 30),
        fileColumnsCount: fileColumns.length,
        firstRowSample: Object.fromEntries(
          Object.entries(firstRow).slice(0, 10).map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
        expectedColumns,
        missingColumns,
        importType,
        rawDataFirstRows: rawData.slice(0, 5).map((row, idx) => ({
          index: idx,
          cells: row.slice(0, 10).map(cell => String(cell).substring(0, 30))
        })),
      });
      
      // Дополнительное логирование для начислений ОЗОН
      if (importType === "accruals") {
        const accrualTypeCol = findColumn(["тип начисления", "тип"]);
        const offerIdCol = findColumn(["артикул"]);
        console.log("🔍 Поиск обязательных колонок для начислений ОЗОН:", {
          accrualTypeCol,
          offerIdCol,
          allColumns: fileColumns,
        });
      }

      if (missingColumns.length > 0) {
        toast({
          title: "Неверная структура файла",
          description: `Отсутствуют колонки: ${missingColumns.join(", ")}. Найдены колонки: ${fileColumns.slice(0, 5).join(", ")}${fileColumns.length > 5 ? "..." : ""}`,
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      toast({
        title: "Файл загружен",
        description: `Найдено строк: ${jsonData.length}`,
      });

      onFileSelect(jsonData, file.name);
    } catch (error: any) {
      console.error("❌ ОШИБКА при парсинге Excel:", {
        error,
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        importType,
        fileName: file?.name,
      });
      toast({
        title: "Ошибка при чтении файла",
        description: error.message || "Не удалось прочитать Excel файл",
        variant: "destructive",
      });
      setSelectedFile(null);
    } finally {
      setIsProcessing(false);
      console.log("✅ Обработка файла завершена");
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

        {/* Подсказка по структуре файла */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-semibold mb-2">Ожидаемые колонки:</p>
          <p className="text-xs text-muted-foreground">
            {EXPECTED_COLUMNS[importType].join(", ")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
