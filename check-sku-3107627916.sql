-- Проверка данных для SKU 3107627916 за период 18-19.12.2025
-- Должно быть: Заказы=10, Заказы модели=1, Продажи=14750₽, Продажи с моделей=1198₽

SELECT
    stat_date,
    campaign_name,
    sku,
    orders,
    orders_model,
    revenue,
    orders + COALESCE(orders_model, 0) as total_orders_sum,
    money_spent,
    views,
    clicks,
    imported_at
FROM ozon_performance_daily
WHERE sku = '3107627916'
    AND stat_date BETWEEN '2025-12-18' AND '2025-12-19'
ORDER BY stat_date, campaign_name;

-- Агрегированные данные по SKU
SELECT
    '18-19.12.2025' as period,
    SUM(orders) as total_orders,
    SUM(orders_model) as total_orders_model,
    SUM(orders + COALESCE(orders_model, 0)) as total_all_orders,
    SUM(revenue) as total_revenue,
    SUM(money_spent) as total_spent,
    SUM(views) as total_views,
    SUM(clicks) as total_clicks
FROM ozon_performance_daily
WHERE sku = '3107627916'
    AND stat_date BETWEEN '2025-12-18' AND '2025-12-19';

-- Ожидаемые значения из OZON:
-- Заказы: 10
-- Заказы модели: 1
-- ИТОГО заказов: 11
-- Продажи: 14750₽
-- Продажи с заказов модели: 1198₽
