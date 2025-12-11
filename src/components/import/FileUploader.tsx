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
  accruals: ["Тип начисления", "Артикул"], // минимальные требования
  storage_costs: ["Дата", "Артикул"],
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

  // нормализация строк для сравнения
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, " ").trim();

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
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      if (!workbook.SheetNames.length) {
        throw new Error("В файле нет листов");
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 2. Преобразуем лист в JSON.
      //    ВАЖНО: НЕ указываем header: 1 → первая строка считается заголовком
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
        raw: false,
      }) as any[];

      if (!jsonData.length) {
        toast({
          title: "Файл пуст",
          description: "Excel файл не содержит данных",
          variant: "destructive",
        });
        setSelectedFile(null);
        return;
      }

      // 3. Берём список колонок по ключам первой строки
      const firstRow = jsonData[0] as Record<string, any>;
      const fileColumns = Object.keys(firstRow);

      // функция поиска колонки по ключевым словам
      const findColumn = (keywords: string[]) => {
        const normKeywords = keywords.map(normalize);
        return fileColumns.find((fc) => {
          const nf = normalize(fc);
          return normKeywords.some((kw) => nf.includes(kw));
        });
      };

      const missingColumns: string[] = [];

      if (importType === "accruals") {
        const accrualTypeCol = findColumn(["тип начисления", "тип начисл"]);
        const offerIdCol = findColumn(["артикул"]);

        if (!accrualTypeCol) missingColumns.push("Тип начисления");
        if (!offerIdCol) missingColumns.push("Артикул");
      } else if (importType === "storage_costs") {
        const dateCol = findColumn(["дата"]);
        const offerIdCol = findColumn(["артикул"]);
        if (!dateCol) missingColumns.push("Дата");
        if (!offerIdCol) missingColumns.push("Артикул");
      }

      console.log("🔍 Проверка колонок файла:", {
        importType,
        fileColumns,
        missingColumns,
        firstRowSample: Object.fromEntries(
          Object.entries(firstRow)
            .slice(0, 10)
            .map(([k, v]) => [k, String(v).substring(0, 50)])
        ),
      });

      if (missingColumns.length > 0) {
        toast({
          title: "Неверная структура файла",
          description: `Отсутствуют колонки: ${missingColumns.join(
            ", "
          )}. Найдены колонки: ${fileColumns
            .slice(0, 5)
            .join(", ")}${fileColumns.length > 5 ? "..." : ""}`,
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
      console.error("❌ ОШИБКА при парсинге Excel:", error);
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
