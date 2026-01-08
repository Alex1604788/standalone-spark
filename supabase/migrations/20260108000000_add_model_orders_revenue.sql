-- =====================================================
-- Migration: Add orders_model and revenue_model fields
-- Date: 2026-01-08
-- Description: Добавляем поля для заказов и выручки от модельных товаров
-- =====================================================

-- Добавляем поля для модельных заказов и выручки
ALTER TABLE public.ozon_performance_daily
  ADD COLUMN IF NOT EXISTS orders_model INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revenue_model DECIMAL(10, 2);

-- Комментарии к полям
COMMENT ON COLUMN public.ozon_performance_daily.orders_model IS 'Заказы с модели товара';
COMMENT ON COLUMN public.ozon_performance_daily.revenue_model IS 'Выручка от заказов с модели товара';
