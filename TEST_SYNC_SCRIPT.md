# Скрипт тестирования синхронизации товаров

## 1. Открыть консоль браузера на странице приложения

Нажмите F12 или Ctrl+Shift+I (Cmd+Option+I на Mac)

## 2. Выполнить скрипт синхронизации

```javascript
// Импортировать Supabase клиент
const { createClient } = window.supabase || {};
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

// Параметры синхронизации
const marketplace_id = "b4966072-fd94-4c55-8737-0bd35bea8c50";
const client_id = 1172055;
const api_key = "<<<ВСТАВЬТЕ API KEY ЗДЕСЬ>>>";

// Запуск синхронизации
const { data, error } = await supabase.functions.invoke("sync-products", {
  body: { 
    marketplace_id, 
    client_id, 
    api_key, 
    page: 1, 
    page_size: 100 
  },
});

console.log("Sync result:", { data, error });
```

## 3. SQL запросы для проверки

### Общее количество товаров
```sql
SELECT COUNT(*) AS total_products
FROM public.products
WHERE marketplace_id = 'b4966072-fd94-4c55-8737-0bd35bea8c50';
```

### Проверка заполненности полей
```sql
SELECT
  COUNT(*) FILTER (WHERE name IS NULL) AS missing_name,
  COUNT(*) FILTER (WHERE brand IS NULL) AS missing_brand,
  COUNT(*) FILTER (WHERE image_url IS NULL) AS missing_image,
  COUNT(*) FILTER (WHERE sku IS NULL) AS missing_sku
FROM public.products
WHERE marketplace_id = 'b4966072-fd94-4c55-8737-0bd35bea8c50';
```

### Последние 10 товаров
```sql
SELECT external_id, sku, name, brand, image_url, created_at
FROM public.products
WHERE marketplace_id = 'b4966072-fd94-4c55-8737-0bd35bea8c50'
ORDER BY created_at DESC
LIMIT 10;
```

### Статус синхронизации
```sql
SELECT last_sync_at, last_sync_status, last_sync_error
FROM public.marketplaces
WHERE id = 'b4966072-fd94-4c55-8737-0bd35bea8c50';
```

## 4. Запуск из UI

1. Перейдите на страницу подключения Ozon: `/connect-ozon-api`
2. Введите Client ID: `1172055`
3. Введите API Key (получите у пользователя)
4. Нажмите кнопку **"Синхронизировать товары"**
5. Дождитесь завершения и проверьте результат

## Примечания

- Функция обрабатывает не-JSON ответы от Ozon (HTML/404/антибот)
- Ошибки логируются в поле `last_sync_error` таблицы `marketplaces`
- Используется upsert по уникальному индексу `(marketplace_id, external_id)`
- Максимум 100 товаров за один запрос (параметр `page_size`)
