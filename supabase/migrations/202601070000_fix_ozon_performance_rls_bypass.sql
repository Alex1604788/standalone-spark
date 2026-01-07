-- =====================================================
-- Migration: Fix RLS для ozon_performance_daily
-- Date: 2026-01-07
-- Description: Исправление RLS - service_role должен обходить все проверки
-- =====================================================

-- Service role должен ПОЛНОСТЬЮ обходить RLS
-- Удаляем старые политики
DROP POLICY IF EXISTS "Allow all for postgres and owners" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Allow insert for postgres and owners" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Allow update for postgres and owners" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Allow delete for postgres and owners" ON public.ozon_performance_daily;

-- Политика SELECT: всё видят authenticated пользователи (свои маркетплейсы)
CREATE POLICY "Users can view own marketplace performance data"
  ON public.ozon_performance_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Политика INSERT: authenticated пользователи могут вставлять данные в свои маркетплейсы
-- service_role обходит RLS автоматически через опцию создания клиента
CREATE POLICY "Users can insert own marketplace performance data"
  ON public.ozon_performance_daily FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Политика UPDATE: authenticated пользователи могут обновлять данные в своих маркетплейсах
CREATE POLICY "Users can update own marketplace performance data"
  ON public.ozon_performance_daily FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Политика DELETE: authenticated пользователи могут удалять данные в своих маркетплейсах
CREATE POLICY "Users can delete own marketplace performance data"
  ON public.ozon_performance_daily FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- ВАЖНО: service_role обходит RLS через параметры создания клиента (не через политики)
-- createClient(..., ..., { auth: { autoRefreshToken: false, persistSession: false } })
