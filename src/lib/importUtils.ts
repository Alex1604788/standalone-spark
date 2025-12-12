/**
 * Утилиты для нормализации и парсинга значений при импорте Excel
 */

/**
 * Нормализация строки с удалением невидимых символов (BOM, ZERO WIDTH SPACE и т.д.)
 */
export const normalize = (s: string): string =>
  s
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, "") // удалить скрытые символы (BOM, ZERO WIDTH SPACE и т.д.)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Очистка текстового значения
 * - убирает BOM, zero-width, управляющие символы
 * - trim + схлопывает пробелы
 */
export const cleanText = (value: any): string => {
  if (value == null || value === "") return "";
  return normalize(String(value));
};

/**
 * Парсинг числа
 * - убирает пробелы/nbsp
 * - заменяет запятую на точку
 * - заменяет "минус" − на -
 */
export const parseNumber = (value: any): number => {
  if (value == null || value === "") return 0;
  
  const normalized = String(value)
    .replace(/[\s\u00A0\u200B-\u200F\uFEFF]/g, "") // убираем пробелы, неразрывные пробелы, zero-width
    .replace(/[−–—]/g, "-") // заменяем разные типы минусов на обычный минус
    .replace(",", "."); // заменяем запятую на точку
  
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
};

/**
 * Парсинг даты OZON
 * - Excel serial (число)
 * - DD.MM.YYYY
 * - YYYY-MM-DD HH:mm:ss
 * - возвращает YYYY-MM-DD
 */
export const parseDate = (raw: any, fallback?: string): string | null => {
  if (!raw && !fallback) return null;
  if (!raw && fallback) return fallback;

  // Excel serial date
  if (typeof raw === "number") {
    // Excel epoch: 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + raw * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  }

  const str = String(raw).trim();
  if (!str) return fallback || null;

  // Формат DD.MM.YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Формат YYYY-MM-DD HH:mm:ss
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})(?:\s+\d{2}:\d{2}(?::\d{2})?)?/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Стандартный парсинг Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }

  return fallback || null;
};

