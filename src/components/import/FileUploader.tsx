import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { fixWeirdUtf16, normalizeStringValue, parseNumber, parseDate } from "@/lib/importUtils";

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

// Строгие шаблоны колонок (порядок фиксированный, строка 1)
const TEMPLATE_COLUMNS: Record<ImportType, string[]> = {
  accruals: [
    "Дата начисления",
    "Тип начисления",
    "Номер отправления или идентификатор услуги",
    "Дата принятия заказа в обработку или оказания услуги",
    "Склад отгрузки",
    "SKU",
    "Артикул",
    "Название товара или услуги",
    "Количество",
    "За продажу или возврат до вычета комиссий и услуг",
    "Вознаграждение Ozon, %",
    "Вознаграждение Ozon",
    "Сборка заказа",
    "Обработка отправления (Drop-off/Pick-up) (разбивается по товарам пропорционально количеству в отправлении)",
    "Магистраль",
    "Последняя миля (разбивается по товарам пропорционально доле цены товара в сумме отправления)",
    "Обратная магистраль",
    "Обработка возврата",
    "Обработка отмененного или невостребованного товара (разбивается по товарам в отправлении в одинаковой пропорции)",
    "Обработка невыкупленного товара",
    "Логистика",
    "Индекс локализации",
    "Среднее время доставки, часы",
    "Обратная логистика",
    "Итого, руб.",
  ],
  storage_costs: [
    "Дата",
    "SKU",
    "Артикул",
    "Категория товара",
    "Описательный тип",
    "Склад",
    "Признак товара",
    "Суммарный объем в миллилитрах",
    "Кол-во экземпляров",
    "Платный объем в миллилитрах",
    "Кол-во платных экземпляров",
    "Начисленная стоимость размещения",
  ],
};

/**
 * Безопасная очистка строки для сравнения заголовков
 * Убирает только BOM/zero-width/управляющие символы и нормализует пробелы
 */
const cleanForComparison = (s: string): string => {
  return s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "") // только BOM/ZWSP/управляющие
    .replace(/\s+/g, " ") // схлопываем пробелы
    .trim();
};

/**
 * Извлечение текста заголовка из ячейки (cell.w ?? cell.v)
 */
const getHeaderValue = (cell?: XLSX.CellObject): string => {
  if (!cell) return "";
  const value = (cell as any).w ?? cell.v;
  if (value != null) return String(value);
  return "";
};

/**
 * Генерация шаблона Excel для скачивания
 */
const generateTemplate = (importType: ImportType) => {
  const columns = TEMPLATE_COLUMNS[importType];
  const label = IMPORT_TYPE_LABELS[importType];
  
  // Создаем массив данных: заголовки в строке 1, подсказка в строке 2
  const data: any[][] = [
    columns, // Строка 1: заголовки
    ["Вставьте данные начиная со строки 2", ...Array(columns.length - 1).fill("")], // Строка 2: подсказка
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Данные");
  
  const fileName = `шаблон_${importType === "accruals" ? "начисления_озон" : "стоимость_размещения"}_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, fileName);
};

export const FileUploader = ({
  importType,
  onFileSelect,
  onClear,
}: FileUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDownloadTemplate = () => {
    generateTemplate(importType);
    toast({
      title: "Шаблон скачан",
      description: `Шаблон для ${IMPORT_TYPE_LABELS[importType]} готов к заполнению`,
    });
  };

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
      // 1. Читаем файл
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });

      if (!workbook.SheetNames.length) {
        throw new Error("В файле нет листов");
      }

      // 2. Берём первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 3. Получаем данные построчно (безопасный способ для больших файлов)
      // Вместо sheet_to_json используем прямое чтение из worksheet для избежания переполнения стека
      let rawData: any[][];
      try {
        // Получаем диапазон данных
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const maxRows = 200000; // Максимальное количество строк
        
        if (range.e.r > maxRows) {
          throw new Error(`Файл содержит слишком много строк (${range.e.r + 1}). Максимально поддерживается ${maxRows} строк. Пожалуйста, разбейте файл на части.`);
        }
        
        // Читаем данные построчно напрямую из worksheet (безопаснее, чем sheet_to_json)
        // Используем простую итерацию по ключам worksheet без decode_cell для избежания переполнения стека
        rawData = [];
        const totalRows = Math.min(range.e.r + 1, 150000); // Ограничиваем до 150,000 строк
        
        // Создаем карту ячеек для быстрого доступа (парсим адреса вручную без decode_cell)
        const cellMap = new Map<string, any>();
        for (const addr in worksheet) {
          if (addr[0] === '!') continue; // Пропускаем служебные свойства
          const cell = worksheet[addr];
          if (cell && cell.v != null) {
            // Парсим адрес вручную (например, "A1" -> row=0, col=0)
            const match = addr.match(/^([A-Z]+)(\d+)$/);
            if (match) {
              const colStr = match[1];
              const rowNum = parseInt(match[2]) - 1; // Excel использует 1-based индексы
              
              // Конвертируем буквы колонки в число (A=0, B=1, ..., Z=25, AA=26, ...)
              let colNum = 0;
              for (let i = 0; i < colStr.length; i++) {
                colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
              }
              colNum -= 1; // A=1 в Excel, но нам нужен 0-based индекс
              
              if (rowNum < totalRows && colNum <= range.e.c) {
                cellMap.set(`${rowNum}_${colNum}`, cell.v);
              }
            }
          }
        }
        
        for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
          const row: any[] = [];
          for (let colIndex = 0; colIndex <= range.e.c; colIndex++) {
            const key = `${rowIndex}_${colIndex}`;
            row[colIndex] = cellMap.get(key) || "";
          }
          rawData.push(row);
          
          // Пауза каждые 5000 строк для предотвращения блокировки браузера
          if (rowIndex > 0 && rowIndex % 5000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        
        if (range.e.r + 1 > 150000) {
          toast({
            title: "Предупреждение",
            description: `Файл содержит ${range.e.r + 1} строк. Обработано только первые ${totalRows} строк. Разбейте файл на части для полной обработки.`,
            variant: "destructive",
          });
        }
      } catch (error: any) {
        if (error.message?.includes("stack") || error.message?.includes("Maximum") || error.name === "RangeError") {
          throw new Error("Файл слишком большой для обработки. Попробуйте разбить файл на части (максимум 150,000 строк) или использовать файл меньшего размера.");
        }
        throw error;
      }

      if (!rawData.length) {
        throw new Error("Файл пуст");
      }

      // 4. ВАЛИДАЦИЯ: читаем заголовки из rawData[0] (как и для Начислений)
      // Это безопаснее и быстрее, чем обращаться к worksheet для каждой ячейки
      const expectedColumns = TEMPLATE_COLUMNS[importType];
      const headerRowIndex = 0;
      
      // Безопасное вычисление максимума (избегаем переполнения стека при больших файлах)
      // Используем цикл вместо Math.max(...rawData.map(...))
      let maxCols = 0;
      if (rawData.length > 0) {
        // Для заголовков достаточно проверить первую строку
        maxCols = rawData[0]?.length || 0;
      }

      console.log("🔍 ВАЛИДАЦИЯ: Длина rawData:", rawData.length);
      console.log("🔍 ВАЛИДАЦИЯ: Ожидается колонок:", expectedColumns.length);
      console.log("🔍 ВАЛИДАЦИЯ: Найдено колонок в файле:", maxCols);
      console.log("🔍 ВАЛИДАЦИЯ: Первые 3 заголовка:", rawData[0]?.slice(0, 3));
      if (rawData.length > 1) {
        console.log("🔍 ВАЛИДАЦИЯ: Первые 3 строки данных (первые 3 колонки):", 
          rawData.slice(1, 4).map(row => row?.slice(0, 3))
        );
      }

      // Извлекаем заголовки из rawData[0] (такая же логика, как для Начислений)
      // Это безопаснее, чем обращаться к worksheet для каждой ячейки
      const headerRow = rawData[headerRowIndex] || [];
      const fileHeaders: string[] = [];
      for (let col = 0; col < Math.max(maxCols, expectedColumns.length); col++) {
        const headerValue = headerRow[col];
        // Упрощенная нормализация заголовка (без fixWeirdUtf16 для избежания переполнения стека)
        if (headerValue == null || headerValue === "") {
          fileHeaders.push("");
        } else {
          const header = cleanForComparison(String(headerValue));
          fileHeaders.push(header);
        }
      }

      console.log("🔍 ВАЛИДАЦИЯ: Первые 5 заголовков из файла:", fileHeaders.slice(0, 5));
      console.log("🔍 ВАЛИДАЦИЯ: Первые 5 ожидаемых заголовков:", expectedColumns.slice(0, 5).map(c => cleanForComparison(c)));

      // Валидация: количество колонок
      if (fileHeaders.length !== expectedColumns.length) {
        toast({
          title: "Неверный формат файла",
          description: `Ожидается файл OZON ${IMPORT_TYPE_LABELS[importType]}. Ожидается ${expectedColumns.length} колонок, найдено ${fileHeaders.length}. Загрузите файл, созданный через 'Скачать шаблон'.`,
          variant: "destructive",
        });
        setSelectedFile(null);
        setIsProcessing(false);
        return;
      }

      // Валидация: текст заголовков и порядок (строго 1-в-1)
      for (let i = 0; i < expectedColumns.length; i++) {
        const expected = cleanForComparison(expectedColumns[i]);
        const actual = fileHeaders[i];
        if (expected !== actual) {
          toast({
            title: "Неверный формат файла",
            description: `Ожидается файл OZON ${IMPORT_TYPE_LABELS[importType]}. Колонка ${i + 1} должна быть "${expectedColumns[i]}", найдено "${fileHeaders[i]}". Загрузите файл, созданный через 'Скачать шаблон'.`,
            variant: "destructive",
          });
          setSelectedFile(null);
          setIsProcessing(false);
          return;
        }
      }

      // 5. Парсинг данных (начиная со строки 2, так как строка 1 - заголовки)
      // Оптимизация для больших файлов: обрабатываем батчами, чтобы не блокировать браузер
      const parsedData: any[] = [];
      const PARSE_BATCH_SIZE = 5000; // Обрабатываем по 5000 строк за раз
      
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        
        // Проверка на пустую строку (безопасная, без every для больших массивов)
        if (!row) continue;
        let isEmpty = true;
        for (let j = 0; j < row.length; j++) {
          if (row[j] !== "" && row[j] != null) {
            isEmpty = false;
            break;
          }
        }
        if (isEmpty) continue;

        // Читаем значения по индексу колонки (A=0, B=1, C=2...)
        const rowObj: Record<string, any> = {};
        
        for (let colIndex = 0; colIndex < expectedColumns.length; colIndex++) {
          const value = row[colIndex];
          const columnName = expectedColumns[colIndex];
          
          // Нормализация значений в зависимости от типа колонки
          // Оптимизация: минимальная обработка для избежания переполнения стека
          if (value == null || value === "") {
            rowObj[columnName] = "";
          } else if (typeof value === "string") {
            // Для больших файлов применяем упрощенную нормализацию
            // Используем только базовую очистку, без fixWeirdUtf16 для каждой ячейки
            const str = String(value);
            rowObj[columnName] = str
              .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
              .trim();
          } else if (typeof value === "number") {
            // Числа оставляем как есть (будут обработаны в ImportData)
            rowObj[columnName] = value;
          } else {
            rowObj[columnName] = String(value);
          }
        }

        // Специальная обработка для "Тип начисления" (accruals)
        if (importType === "accruals" && rowObj["Тип начисления"]) {
          const accrualTypeRaw = String(rowObj["Тип начисления"]);
          rowObj["Тип начисления_raw"] = accrualTypeRaw; // оригинал для аудита
          rowObj["Тип начисления_norm"] = accrualTypeRaw
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(); // для аналитики
        }

        parsedData.push(rowObj);
        
        // Пауза каждые PARSE_BATCH_SIZE строк для предотвращения блокировки браузера
        if (i > 1 && i % PARSE_BATCH_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, 0)); // Отдаем управление браузеру
        }
      }

      toast({
        title: "Файл загружен",
        description: `Найдено строк: ${parsedData.length}. Файл соответствует шаблону.`,
      });

      // 6. Отдаём данные дальше
      // Проверяем размер данных перед передачей (избегаем переполнения стека)
      if (parsedData.length > 200000) {
        toast({
          title: "Предупреждение",
          description: `Файл содержит ${parsedData.length} строк. Рекомендуется разбить файл на части для более быстрой обработки.`,
          variant: "destructive",
        });
      }
      
      // Передаем данные асинхронно, чтобы не блокировать текущий стек вызовов
      try {
        // Используем requestIdleCallback или setTimeout для асинхронной передачи
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => {
            onFileSelect(parsedData, file.name);
          }, { timeout: 1000 });
        } else {
          setTimeout(() => {
            onFileSelect(parsedData, file.name);
          }, 0);
        }
      } catch (error: any) {
        if (error.message?.includes("stack") || error.message?.includes("Maximum") || error.name === "RangeError") {
          throw new Error("Файл слишком большой для обработки. Пожалуйста, разбейте файл на части (максимум 200,000 строк).");
        }
        throw error;
      }
    } catch (error: any) {
      console.error("❌ ОШИБКА при парсинге Excel:", error);
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

  const expectedColumns = TEMPLATE_COLUMNS[importType];

  return (
    <Card>
      <CardContent className="pt-6">
        {/* Кнопка скачать шаблон */}
        <div className="mb-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Скачать шаблон: {IMPORT_TYPE_LABELS[importType]}
          </Button>
        </div>

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
          <p className="text-xs font-semibold mb-2">
            Ожидается файл с {expectedColumns.length} колонками:
          </p>
          <p className="text-xs text-muted-foreground">
            {expectedColumns.slice(0, 3).join(", ")}...
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
