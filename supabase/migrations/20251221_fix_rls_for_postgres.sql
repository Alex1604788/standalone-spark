-- =====================================================
-- Migration: Fix RLS policies to work with postgres user
-- Date: 2025-12-21
-- Description: Исправление RLS политик для работы с postgres и service_role
-- =====================================================

-- Удаляем все политики
DROP POLICY IF EXISTS "Users and service can view performance data" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Users and service can insert performance data" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Users and service can update performance data" ON public.ozon_performance_daily;
DROP POLICY IF EXISTS "Users and service can delete performance data" ON public.ozon_performance_daily;

-- Новая политика SELECT: доступ для postgres, service_role, и authenticated пользователей
CREATE POLICY "Allow all for postgres and owners"
  ON public.ozon_performance_daily FOR SELECT
  USING (
    -- postgres суперпользователь видит всё
    current_user = 'postgres'
    OR
    -- service_role видит всё
    current_user = 'service_role'
    OR
    -- authenticated пользователи видят только свои маркетплейсы
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика INSERT
CREATE POLICY "Allow insert for postgres and owners"
  ON public.ozon_performance_daily FOR INSERT
  WITH CHECK (
    current_user = 'postgres'
    OR
    current_user = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика UPDATE
CREATE POLICY "Allow update for postgres and owners"
  ON public.ozon_performance_daily FOR UPDATE
  USING (
    current_user = 'postgres'
    OR
    current_user = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Новая политика DELETE
CREATE POLICY "Allow delete for postgres and owners"
  ON public.ozon_performance_daily FOR DELETE
  USING (
    current_user = 'postgres'
    OR
    current_user = 'service_role'
    OR
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = ozon_performance_daily.marketplace_id
        AND m.user_id = auth.uid()
    )
  );

-- Проверка что политики созданы
SELECT
  policyname,
  cmd,
  CASE
    WHEN policyname LIKE '%postgres%' THEN '✅ Новая политика'
    ELSE '❌ Старая политика'
  END as status
FROM pg_policies
WHERE tablename = 'ozon_performance_daily'
ORDER BY policyname;
