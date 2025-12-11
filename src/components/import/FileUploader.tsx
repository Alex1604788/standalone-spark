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

      // 4. Чистим заголовки от BOM/невидимых символов и utf16-кракозябр
      const firstRawRow = rawJson[0] as Record<string, any>;
      const originalColumns = Object.keys(firstRawRow);

      const headerMap: Record<string, string> = {};
      for (const col of originalColumns) {
        const cleaned = cleanHeaderKey(col);
        headerMap[col] = cleaned || col;
      }

      // 5. Пересобираем строки с "чистыми" ключами и исправляем значения-строки
      const jsonData = rawJson.map((row) => {
        const newRow: Record<string, any> = {};
        Object.entries(row).forEach(([key, value]) => {
          const mappedKey = headerMap[key] ?? key;
          let v = value;
          if (typeof v === "string") {
            v = fixWeirdUtf16(
              v.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "")
            );
          }
          newRow[mappedKey] = v;
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

      // 6. Проверка обязательных колонок (для начислений)
      if (importType === "accruals") {
        const hasAccrualType = fileColumns.some((c) => {
          const n = normalizeForSearch(c);
          re
