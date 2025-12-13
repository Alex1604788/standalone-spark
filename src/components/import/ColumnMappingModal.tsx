import { useState, useEffect } from "react";
import { X, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { normalize } from "@/lib/importUtils";

export type ImportType = "accruals" | "storage_costs";

export interface ColumnMapping {
  [key: string]: string; // ключ - поле БД, значение - название колонки в Excel
}

interface ColumnMappingModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (mapping: ColumnMapping) => void;
  importType: ImportType;
  fileColumns: string[]; // реальные колонки из загруженного файла
  initialMapping?: ColumnMapping; // результат автодетекта
}

// Обязательные поля для каждого типа импорта
const REQUIRED_FIELDS: Record<ImportType, { key: string; label: string; synonyms: string[] }[]> = {
  accruals: [
    { key: "accrual_type", label: "Тип начисления", synonyms: ["тип начисления", "тип операции", "тип"] },
    { key: "offer_id", label: "Артикул", synonyms: ["артикул", "offer id", "seller sku"] },
    { key: "date", label: "Дата начисления", synonyms: ["дата начисления", "дата", "accrual date"] },
  ],
  storage_costs: [
    { key: "offer_id", label: "Артикул", synonyms: ["артикул", "offer id", "seller sku"] },
    { key: "date", label: "Дата", synonyms: ["дата", "cost date", "дата размещения"] },
  ],
};

// Опциональные поля
const OPTIONAL_FIELDS: Record<ImportType, { key: string; label: string; synonyms: string[] }[]> = {
  accruals: [
    { key: "sku", label: "SKU", synonyms: ["sku", "ску"] },
    { key: "quantity", label: "Количество", synonyms: ["количество", "quantity"] },
    { key: "amount_before_commission", label: "До вычета комиссий", synonyms: ["до вычета", "до комиссии", "продажа"] },
    { key: "total_amount", label: "Итого", synonyms: ["итого", "сумма", "total"] },
  ],
  storage_costs: [
    { key: "sku", label: "SKU", synonyms: ["sku", "ску"] },
    { key: "cost", label: "Стоимость размещения", synonyms: ["стоимость размещения", "стоимость", "размещение"] },
    { key: "stock", label: "Остаток", synonyms: ["остаток", "количество", "экземпляр"] },
  ],
};

export const ColumnMappingModal = ({
  open,
  onClose,
  onSave,
  importType,
  fileColumns,
  initialMapping = {},
}: ColumnMappingModalProps) => {
  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [errors, setErrors] = useState<string[]>([]);

  // Инициализация маппинга из initialMapping
  useEffect(() => {
    if (open) {
      setMapping(initialMapping);
      setErrors([]);
    }
  }, [open, initialMapping]);

  const requiredFields = REQUIRED_FIELDS[importType];
  const optionalFields = OPTIONAL_FIELDS[importType];

  const handleFieldChange = (fieldKey: string, columnName: string) => {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: columnName,
    }));
    // Очищаем ошибки при изменении
    if (errors.length > 0) {
      setErrors([]);
    }
  };

  const handleSave = () => {
    // Валидация: все обязательные поля должны быть выбраны
    const missingFields: string[] = [];
    requiredFields.forEach((field) => {
      if (!mapping[field.key] || mapping[field.key] === "") {
        missingFields.push(field.label);
      }
    });

    if (missingFields.length > 0) {
      setErrors([`Необходимо выбрать колонки для: ${missingFields.join(", ")}`]);
      return;
    }

    // Проверка на дубликаты (одна колонка для разных полей)
    const usedColumns = Object.values(mapping).filter((v) => v && v !== "");
    const duplicates = usedColumns.filter((col, idx) => usedColumns.indexOf(col) !== idx);
    if (duplicates.length > 0) {
      setErrors([`Одна колонка не может быть использована для нескольких полей: ${[...new Set(duplicates)].join(", ")}`]);
      return;
    }

    onSave(mapping);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройка сопоставления колонок</DialogTitle>
          <DialogDescription>
            Выберите, какая колонка из файла соответствует каждому полю базы данных
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {errors.map((error, idx) => (
                <div key={idx}>{error}</div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-6 py-4">
          {/* Обязательные поля */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-foreground">
              Обязательные поля <span className="text-red-500">*</span>
            </h3>
            <div className="space-y-4">
              {requiredFields.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label} <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={mapping[field.key] || "__none__"}
                    onValueChange={(value) => handleFieldChange(field.key, value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger id={field.key}>
                      <SelectValue placeholder="Выберите колонку..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-- Не выбрано --</SelectItem>
                      {fileColumns.map((col) => (
                        <SelectItem key={col} value={col}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {/* Опциональные поля */}
          {optionalFields.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                Опциональные поля
              </h3>
              <div className="space-y-4">
                {optionalFields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={field.key}>{field.label}</Label>
                    <Select
                      value={mapping[field.key] || "__none__"}
                      onValueChange={(value) => handleFieldChange(field.key, value === "__none__" ? "" : value)}
                    >
                      <SelectTrigger id={field.key}>
                        <SelectValue placeholder="Выберите колонку (необязательно)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">-- Не выбрано --</SelectItem>
                        {fileColumns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSave}>Сохранить и продолжить</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Автодетект маппинга по синонимам
 */
export const guessMapping = (
  importType: ImportType,
  fileColumns: string[]
): ColumnMapping => {
  const mapping: ColumnMapping = {};
  const allFields = [...REQUIRED_FIELDS[importType], ...OPTIONAL_FIELDS[importType]];

  for (const field of allFields) {
    // Нормализуем все колонки для поиска
    const normalizedColumns = fileColumns.map((col) => ({
      original: col,
      normalized: normalize(col),
    }));

    // Ищем по синонимам
    for (const synonym of field.synonyms) {
      const normalizedSynonym = normalize(synonym);
      const found = normalizedColumns.find(
        (nc) =>
          nc.normalized === normalizedSynonym ||
          nc.normalized.includes(normalizedSynonym) ||
          normalizedSynonym.includes(nc.normalized)
      );

      if (found) {
        mapping[field.key] = found.original;
        break; // Нашли, переходим к следующему полю
      }
    }
  }

  return mapping;
};

