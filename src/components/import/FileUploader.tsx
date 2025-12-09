import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export type ImportType = "accruals" | "storage_costs" | "promotion_costs" | "business_data";

interface FileUploaderProps {
  importType: ImportType;
  onFileSelect: (data: any[], fileName: string) => void;
  onClear?: () => void;
}

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  accruals: "Начисления ОЗОН",
  storage_costs: "Стоимость размещения",
  promotion_costs: "Затраты на продвижение",
  business_data: "Номенклатура",
};

const EXPECTED_COLUMNS: Record<ImportType, string[]> = {
  accruals: ["Тип начисления", "Артикул"],  // Минимальные требования
  storage_costs: ["Дата", "Артикул"],
  promotion_costs: ["SKU"],
  business_data: ["Артикул"],
};

export const FileUploader = ({ importType, onFileSelect, onClear }: FileUploaderProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Проверка расширения
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
      // Парсинг Excel файла
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Берем первый лист
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // Конвертируем в JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

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

      const missingColumns = expectedColumns.filter(
        (col) => !fileColumns.some((fc) => fc.includes(col))
      );

      if (missingColumns.length > 0) {
        toast({
          title: "Неверная структура файла",
          description: `Отсутствуют колонки: ${missingColumns.join(", ")}`,
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
      console.error("Error parsing Excel:", error);
      toast({
        title: "Ошибка при чтении файла",
        description: error.message || "Не удалось прочитать Excel файл",
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
