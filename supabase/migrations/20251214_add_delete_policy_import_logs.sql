-- =====================================================
-- Migration: Add DELETE policy for import_logs
-- Date: 2025-12-14
-- Description: Добавляем политику RLS для удаления записей истории импорта
-- =====================================================

-- RLS Policy for DELETE
CREATE POLICY "Users can delete import logs from own marketplaces"
  ON public.import_logs FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = import_logs.marketplace_id AND m.user_id = auth.uid()
    )
  );

