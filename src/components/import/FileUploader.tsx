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

// Строгие шаблоны колонок (порядок фиксированный)
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
 * Безопасная очистка строки - только удаление BOM/zero-width/управляющих символов
 * НЕ использует fixWeirdUtf16, чтобы не ломать кириллицу
 */
const safeClean = (s: string): string => {
  return s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "") // только BOM/ZWSP/управляющие
    .trim();
};

/**
 * Нормализация для аналитики (lower + trim + убрать двойные пробелы + убрать невидимые символы)
 */
const normalizeForAnalytics = (s: string): string => {
  return safeClean(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
};

/**
 * Извлечение текста заголовка из ячейки (cell.w ?? cell.v)
 */
const getHeaderValue = (cell?: XLSX.CellObject): string => {
  if (!cell) return "";
  // Используем cell.w (formatted) если есть, иначе cell.v (raw)
  const value = (cell as any).w ?? cell.v;
  if (value != null) return String(value);
  return "";
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

      // 3. Получаем данные (raw: false для использования cell.w)
      const rawData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,  // Используем formatted values (cell.w)
      }) as any[][];

      if (!rawData.length) {
        throw new Error("Файл пуст");
      }

      // 4. ВАЛИДАЦИЯ: читаем заголовки из первой строки
      const expectedColumns = TEMPLATE_COLUMNS[importType];
      const headerRowIndex = 0;
      const maxCols = Math.max(...rawData.map(row => row?.length || 0), 0);

      console.log("🔍 ВАЛИДАЦИЯ: Ожидается колонок:", expectedColumns.length);
      console.log("🔍 ВАЛИДАЦИЯ: Найдено колонок в файле:", maxCols);

      // Извлекаем заголовки напрямую из worksheet
      const fileHeaders: string[] = [];
      for (let col = 0; col < maxCols; col++) {
        const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c: col });
        const cell = worksheet[addr] as XLSX.CellObject | undefined;
        const header = safeClean(getHeaderValue(cell));
        fileHeaders.push(header);
      }

      console.log("🔍 ВАЛИДАЦИЯ: Первые 5 заголовков из файла:", fileHeaders.slice(0, 5));
      console.log("🔍 ВАЛИДАЦИЯ: Первые 5 ожидаемых заголовков:", expectedColumns.slice(0, 5));

      // Валидация: количество колонок
      if (fileHeaders.length !== expectedColumns.length) {
        const fileTypeLabel = importType === "accruals" ? "«Начисления»" : "«Стоимость размещения»";
        toast({
          title: "Неверный формат файла",
          description: `Ожидается файл OZON ${fileTypeLabel}. Ожидается ${expectedColumns.length} колонок, найдено ${fileHeaders.length}.`,
          variant: "destructive",
        });
        setSelectedFile(null);
        setIsProcessing(false);
        return;
      }

      // Валидация: текст заголовков и порядок (строго 1-в-1)
      for (let i = 0; i < expectedColumns.length; i++) {
        const expected = safeClean(expectedColumns[i]);
        const actual = safeClean(fileHeaders[i]);
        if (expected !== actual) {
          const fileTypeLabel = importType === "accruals" ? "«Начисления»" : "«Стоимость размещения»";
          const firstColumnName = importType === "accruals" ? "Дата начисления" : "Дата";
          toast({
            title: "Неверный формат файла",
            description: `Ожидается файл OZON ${fileTypeLabel}. Колонка ${i + 1} должна быть "${expectedColumns[i]}", найдено "${fileHeaders[i]}".`,
            variant: "destructive",
          });
          setSelectedFile(null);
          setIsProcessing(false);
          return;
        }
      }

      // 5. Парсинг данных (начиная со строки 1, так как строка 0 - заголовки)
      const parsedData: any[] = [];
      for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.every((c: any) => c === "")) continue;

        const rowObj: Record<string, any> = {};
        
        // Заполняем все колонки по порядку
        // ЗАПРЕЩЕНО: менять регистр, нормализовывать, "чинить" значения
        for (let j = 0; j < expectedColumns.length; j++) {
          const value = row[j];
          // Сохраняем значение как есть, без изменений
          rowObj[expectedColumns[j]] = value != null ? value : "";
        }

        // Специальная обработка для "Тип начисления" (accruals)
        // Сохраняем оригинал и нормализованную версию для аналитики
        if (importType === "accruals" && rowObj["Тип начисления"]) {
          const accrualTypeRaw = String(rowObj["Тип начисления"]);
          rowObj["Тип начисления_raw"] = accrualTypeRaw; // оригинал для аудита
          rowObj["Тип начисления_norm"] = normalizeForAnalytics(accrualTypeRaw); // для аналитики
        }

        parsedData.push(rowObj);
      }

      toast({
        title: "Файл загружен",
        description: `Найдено строк: ${parsedData.length}. Файл соответствует шаблону.`,
      });

      // 6. Отдаём данные дальше
      onFileSelect(parsedData, file.name);
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
