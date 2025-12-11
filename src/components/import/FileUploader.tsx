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
  accruals: ["Тип начисления", "Артикул"],
  storage_costs: ["Дата", "Артикул"],
};

/**
 * Удаляем невидимые/служебные символы (BOM, zero-width, управляющие),
 * приводим пробелы к одному, режем по краям и в нижний регистр для поиска.
 */
const normalizeForSearch = (s: string) =>
  s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Чистим заголовок, но без приведения к lower — это пойдёт в ключи объекта.
 */
const cleanHeaderKey = (s: string) =>
  s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "").trim();

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
      // 1. читаем файл
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      if (!workbook.SheetNames.length) {
        throw new Error("В файле нет листов");
      }

      // 2. берём первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 3. конвертируем лист в JSON
      const rawJson = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      }) as any[];

      if (!rawJson.length) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // 4. Чистим заголовки от BOM/невидимых символов и
      //    пересобираем объекты с "чистыми" ключами
      const firstRawRow = rawJson[0] as Record<string, any>;
      const originalColumns = Object.keys(firstRawRow);

      const headerMap: Record<string, string> = {};
      for (const col of originalColumns) {
        const cleaned = cleanHeaderKey(col);
        headerMap[col] = cleaned || col;
      }

      const jsonData = rawJson.map((row) => {
        const newRow: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          const mappedKey = headerMap[key] ?? key;
          newRow[mappedKey] = value;
        });
        return newRow;
      });

      const firstRow = jsonData[0] as Record<string, any>;
      const fileColumns = Object.keys(firstRow);

      console.log("📄 FileUploader: загружен файл", {
        importType,
        fileName: file.name,
        sheet: firstSheetName,
        originalColumns,
        cleanedColumns: fileColumns,
        sampleRow: Object.fromEntries(
          Object.entries(firstRow)
            .slice(0, 10)
            .map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
      });

      // 5. Мягкая проверка обязательных колонок
      if (importType === "accruals") {
        const hasAccrualType = fileColumns.some((c) => {
          const n = normalizeForSearch(c);
          return n === "тип начисления" || n.includes("тип начисл");
        });

        const hasOfferId = fileColumns.some((c) => {
          const n = normalizeForSearch(c);
          return n === "артикул" || n.includes("артикул");
        });

        if (!hasAccrualType || !hasOfferId) {
          console.warn("⚠️ Обязательные колонки не найдены", {
            fileColumns,
            normalized: fileColumns.map((c) => normalizeForSearch(c)),
          });

          toast({
            title: "Не найдены обязательные колонки",
            description:
              "Ожидаются колонки «Тип начисления» и «Артикул». Откройте файл и проверьте названия заголовков. Полный список колонок есть в консоли (F12).",
            variant: "destructive",
          });
          // можно вернуть, если хочешь блокировать импорт:
          // setIsProcessing(false);
          // return;
        }
      }

      toast({
        title: "Файл загружен",
        description: `Найдено строк: ${jsonData.length}`,
      });

      // 6. Отдаём уже ОЧИЩЕННЫЕ данные наружу
      onFileSelect(jsonData, file.name);
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
    </Card>
  );
};
