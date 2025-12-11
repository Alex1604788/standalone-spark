# ====================================================
# OZON Performance API Test Script
# ====================================================
# Этот скрипт проверяет подключение к OZON Performance API
# и показывает правильный формат запросов

# ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ НА ВАШИ РЕАЛЬНЫЕ CREDENTIALS
$CLIENT_ID = "YOUR_CLIENT_ID_HERE"
$CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OZON Performance API Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ====================================================
# ШАГ 1: Получение токена
# ====================================================
Write-Host "ШАГ 1: Получение access token..." -ForegroundColor Yellow

$tokenUrl = "https://api-performance.ozon.ru/api/client/token"

$tokenBody = @{
    client_id = 90785244-1765421892659@advertising.performance.ozon.ru
    client_secret = HWuQ7Sz74G6cb8gmuj81cOwT2yy2t3uL_lRjdXhV-p8wCE7UD_pWv8oujnaBPjBtYFCei0fMAE2v0D7vZw
    grant_type = "client_credentials"
} | ConvertTo-Json

Write-Host "URL: $tokenUrl" -ForegroundColor Gray
Write-Host "Body: $tokenBody" -ForegroundColor Gray
Write-Host ""

try {
    $tokenResponse = Invoke-RestMethod -Uri $tokenUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body $tokenBody `
        -ErrorAction Stop

    Write-Host "✅ Токен получен успешно!" -ForegroundColor Green
    Write-Host "Access Token: $($tokenResponse.access_token.Substring(0, 20))..." -ForegroundColor Green
    Write-Host "Token Type: $($tokenResponse.token_type)" -ForegroundColor Gray
    Write-Host "Expires In: $($tokenResponse.expires_in) секунд" -ForegroundColor Gray
    Write-Host ""

    $accessToken = $tokenResponse.access_token

} catch {
    Write-Host "❌ ОШИБКА получения токена!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red

    # Попытка прочитать тело ответа
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "ВОЗМОЖНЫЕ ПРИЧИНЫ:" -ForegroundColor Yellow
    Write-Host "1. Неправильный Client ID или Client Secret" -ForegroundColor Yellow
    Write-Host "2. Неправильный URL (проверьте документацию OZON)" -ForegroundColor Yellow
    Write-Host "3. API ключ не активирован в личном кабинете OZON" -ForegroundColor Yellow

    exit 1
}

# ====================================================
# ШАГ 2: Получение статистики (тест)
# ====================================================
Write-Host "ШАГ 2: Запрос статистики за последние 7 дней..." -ForegroundColor Yellow

$statsUrl = "https://api-performance.ozon.ru/api/client/statistics"

# Даты за последние 7 дней
$endDate = Get-Date -Format "yyyy-MM-dd"
$startDate = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")

$statsBody = @{
    date_from = $startDate
    date_to = $endDate
    group_by = "DATE"
} | ConvertTo-Json

Write-Host "URL: $statsUrl" -ForegroundColor Gray
Write-Host "Period: $startDate to $endDate" -ForegroundColor Gray
Write-Host "Body: $statsBody" -ForegroundColor Gray
Write-Host ""

try {
    $statsResponse = Invoke-RestMethod -Uri $statsUrl `
        -Method Post `
        -ContentType "application/json" `
        -Headers @{
            "Authorization" = "Bearer $accessToken"
            "Accept" = "application/json"
        } `
        -Body $statsBody `
        -ErrorAction Stop

    Write-Host "✅ Статистика получена успешно!" -ForegroundColor Green

    if ($statsResponse.rows) {
        Write-Host "Количество записей: $($statsResponse.rows.Count)" -ForegroundColor Green

        if ($statsResponse.rows.Count -gt 0) {
            Write-Host ""
            Write-Host "Пример первой записи:" -ForegroundColor Cyan
            $firstRow = $statsResponse.rows[0]
            $firstRow.PSObject.Properties | ForEach-Object {
                Write-Host "  $($_.Name): $($_.Value)" -ForegroundColor Gray
            }

            # Сохраняем полный ответ в файл
            $statsResponse | ConvertTo-Json -Depth 10 | Out-File "ozon_api_response.json" -Encoding UTF8
            Write-Host ""
            Write-Host "Полный ответ сохранён в файл: ozon_api_response.json" -ForegroundColor Cyan
        } else {
            Write-Host "⚠️ Нет данных за указанный период" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️ Неожиданный формат ответа" -ForegroundColor Yellow
        Write-Host "Response: $($statsResponse | ConvertTo-Json -Depth 3)" -ForegroundColor Gray
    }

} catch {
    Write-Host "❌ ОШИБКА получения статистики!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }

    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "ВАЖНАЯ ИНФОРМАЦИЯ ДЛЯ EDGE FUNCTION:" -ForegroundColor Yellow
Write-Host "1. Token URL: $tokenUrl" -ForegroundColor Gray
Write-Host "2. Stats URL: $statsUrl" -ForegroundColor Gray
Write-Host "3. Token expires in: $($tokenResponse.expires_in) секунд" -ForegroundColor Gray
Write-Host "4. Group by: DATE (группировка по дням)" -ForegroundColor Gray
