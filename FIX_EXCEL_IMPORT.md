# Проблема с импортом Excel - все суммы = 0.00

## Причина
Функция `findColumn()` не находит колонки "Итого" и "За продажу до вычета комиссий" в Excel файле, либо значения не парсятся.

## Решение

### 1. Улучшить поиск колонок (добавить больше вариантов названий)

```typescript
// В функции importAccruals, строка 177-178:

// БЫЛО:
const amountBeforeCol = findColumn(["до вычета", "до комиссии", "продажа"]);
const totalCol = findColumn(["итого", "сумма"]);

// СТАЛО (добавить все возможные варианты):
const amountBeforeCol = findColumn([
  "до вычета",
  "до комиссии",
  "продажа",
  "за продажу до вычета комиссий",
  "сумма до комиссии"
]);

const totalCol = findColumn([
  "итого",
  "сумма",
  "total",
  "amount"
]);
```

### 2. Улучшить парсинг чисел (обработка пробелов, валют)

```typescript
// Добавить функцию для парсинга чисел с учетом форматирования OZON
const parseAmount = (value: any): number => {
  if (!value) return 0;

  let str = String(value).trim();

  // Убираем символы валюты
  str = str.replace(/[₽$€]/g, '');

  // Убираем пробелы (разделители тысяч)
  str = str.replace(/\s/g, '');

  // Заменяем запятую на точку
  str = str.replace(',', '.');

  // Парсим
  const num = parseFloat(str);

  return isNaN(num) ? 0 : num;
};

// Использовать вместо parseFloat:
amount_before_commission: parseAmount(row[amountBeforeCol]),
total_amount: parseAmount(row[totalCol]),
quantity: parseAmount(row[quantityCol]),
```

### 3. Добавить логирование для отладки

```typescript
// После нахождения колонок, перед вставкой:
console.log('Excel columns found:', {
  accrualType: accrualTypeCol,
  offerId: offerIdCol,
  totalCol: totalCol,
  amountBeforeCol: amountBeforeCol,
  totalValue: row[totalCol],
  amountBeforeValue: row[amountBeforeCol]
});
```

### 4. Проверить структуру Excel файла

Запросите у пользователя:
1. Скриншот первых строк Excel файла с начислениями
2. Или список всех колонок из Excel

## Temporary Fix (SQL)

Если данные уже импортированы с 0, можно попробовать переимпортировать только суммы:

```sql
-- Удалить записи с нулевыми суммами
DELETE FROM ozon_accruals
WHERE total_amount = 0 AND amount_before_commission = 0;

-- Переимпортировать файлы заново
```
