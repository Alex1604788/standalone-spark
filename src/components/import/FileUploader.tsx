import { useState, useRef, useEffect } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { ColumnMappingModal, guessMapping, type ColumnMapping } from "./ColumnMappingModal";
import { normalizeHeader, fixUtf16Mojibake, fixWeirdUtf16 } from "@/lib/importUtils";

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
 * Чистим заголовок для использования в качестве ключа объекта.
 * Сохраняет регистр для ключей, но использует fixWeirdUtf16 для исправления кракозябр.
 */
const cleanHeaderKey = (s: string) => {
  // Исправляем UTF-16 кракозябры, но сохраняем регистр для ключей объекта
  return fixWeirdUtf16(s)
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
    .trim();
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
  const [rawData, setRawData] = useState<any[][]>([]);
  const [showHeaderSelector, setShowHeaderSelector] = useState(false);
  const [headerRowIndex, setHeaderRowIndex] = useState<number | null>(null);
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
        setIsProcessing(false);
        return;
      }

      // 4. Останавливаемся и показываем селектор строки заголовков
      setRawData(rawData);
      setFileName(file.name);
      setShowHeaderSelector(true);
      setIsProcessing(false);
      return;
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

  // Реакция на выбор строки заголовков
  useEffect(() => {
    if (headerRowIndex === null) return;

    const headerRow = rawData[headerRowIndex] || [];

    // 🔥 ЕДИНСТВЕННОЕ ПРАВИЛЬНОЕ МЕСТО ДЕКОДИРОВАНИЯ
    const cleanedHeaders = headerRow
      .map(h => fixUtf16Mojibake(String(h ?? "")))
      .map(h => cleanHeaderKey(h))
      .filter(h => h.length > 0);

    console.log("HEADERS FINAL:", cleanedHeaders);

    const data: any[] = [];

    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.every((c: any) => c === "")) continue;

      const obj: Record<string, any> = {};
      cleanedHeaders.forEach((h, idx) => {
        obj[h] = row[idx] ?? "";
      });

      data.push(obj);
    }

    // ❗❗❗ ВАЖНО
    setFileColumns(cleanedHeaders);   // ← ТОЛЬКО ОНИ
    setParsedData(data);

    const guessed = guessMapping(importType, cleanedHeaders);
    setInitialMapping(guessed);
    setShowMappingModal(true);
  }, [headerRowIndex]);

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
      
      {/* Диалог выбора строки заголовков */}
      {showHeaderSelector && (
        <Dialog open={showHeaderSelector} onOpenChange={() => setShowHeaderSelector(false)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Выберите строку с заголовками</DialogTitle>
              <DialogDescription>
                Кликните по строке, где находятся названия колонок (Артикул, SKU, Дата и т.д.)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1">
              {rawData.slice(0, 20).map((row, idx) => (
                <div
                  key={idx}
                  className="flex gap-2 p-2 border rounded cursor-pointer hover:bg-muted"
                  onClick={() => {
                    setHeaderRowIndex(idx);
                    setShowHeaderSelector(false);
                  }}
                >
                  <div className="w-10 text-xs text-muted-foreground">
                    #{idx + 1}
                  </div>
                  {row.slice(0, 6).map((cell, i) => (
                    <div
                      key={i}
                      className="truncate max-w-[180px] text-sm"
                    >
                      {String(cell)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

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
