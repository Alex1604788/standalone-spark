-- =========================================
-- FIX: Reply Publication System (500 Error)
-- =========================================
-- This script applies missing migrations that caused get-pending-replies to fail
--
-- ИНСТРУКЦИЯ:
-- 1. Откройте https://supabase.com/dashboard/project/nxymhkyvhcfcwjcfcbfy/sql/new
-- 2. Скопируйте и вставьте весь этот SQL код
-- 3. Нажмите "Run" для выполнения
-- 4. После выполнения проверьте работу расширения
-- =========================================

-- MIGRATION 1: Добавление soft delete (deleted_at)
-- Источник: 20251128151933_c10f56b0-bba3-4829-acd4-3bac7d2b0479.sql

-- 1. Добавляем поле deleted_at для soft delete
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.replies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Создаем индексы для быстрой фильтрации неудаленных записей
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at ON public.reviews(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_questions_deleted_at ON public.questions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_replies_deleted_at ON public.replies(deleted_at) WHERE deleted_at IS NULL;

-- 3. Функция для логирования изменений в audit_log
CREATE OR REPLACE FUNCTION public.log_data_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Логируем DELETE операции
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      entity_type,
      entity_id,
      details,
      ip_address
    ) VALUES (
      auth.uid(),
      'DELETE',
      TG_TABLE_NAME,
      OLD.id,
      jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'deleted_data', to_jsonb(OLD),
        'timestamp', now()
      ),
      current_setting('request.headers', true)::json->>'x-forwarded-for'
    );
    RETURN OLD;
  END IF;

  -- Логируем UPDATE операции
  IF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_log (
      user_id,
      action,
      entity_type,
      entity_id,
      details,
      ip_address
    ) VALUES (
      auth.uid(),
      'UPDATE',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'operation', TG_OP,
        'table', TG_TABLE_NAME,
        'old_data', to_jsonb(OLD),
        'new_data', to_jsonb(NEW),
        'timestamp', now()
      ),
      current_setting('request.headers', true)::json->>'x-forwarded-for'
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Создаем триггеры для автоматического логирования
DROP TRIGGER IF EXISTS log_reviews_changes ON public.reviews;
CREATE TRIGGER log_reviews_changes
  BEFORE DELETE OR UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.log_data_changes();

DROP TRIGGER IF EXISTS log_questions_changes ON public.questions;
CREATE TRIGGER log_questions_changes
  BEFORE DELETE OR UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_data_changes();

DROP TRIGGER IF EXISTS log_replies_changes ON public.replies;
CREATE TRIGGER log_replies_changes
  BEFORE DELETE OR UPDATE ON public.replies
  FOR EACH ROW
  EXECUTE FUNCTION public.log_data_changes();

-- 5. Функция для восстановления удаленных записей
CREATE OR REPLACE FUNCTION public.restore_deleted_record(
  p_table_name text,
  p_record_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format('UPDATE %I SET deleted_at = NULL WHERE id = $1', p_table_name)
  USING p_record_id;

  INSERT INTO public.audit_log (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) VALUES (
    auth.uid(),
    'RESTORE',
    p_table_name,
    p_record_id,
    jsonb_build_object('timestamp', now())
  );

  RETURN true;
END;
$$;

COMMENT ON COLUMN public.reviews.deleted_at IS 'Soft delete timestamp - NULL means record is active';
COMMENT ON COLUMN public.questions.deleted_at IS 'Soft delete timestamp - NULL means record is active';
COMMENT ON COLUMN public.replies.deleted_at IS 'Soft delete timestamp - NULL means record is active';

-- MIGRATION 2: Исправление RLS политик
-- Источник: 20251128151953_e8dad73b-c29f-427d-91f4-2dbc159814ae.sql

-- 1. Удаляем Security Definer Views (если были созданы)
DROP VIEW IF EXISTS public.active_reviews;
DROP VIEW IF EXISTS public.active_questions;
DROP VIEW IF EXISTS public.active_replies;

-- 2. Обновляем RLS политики для автоматической фильтрации неудаленных записей

-- Reviews policies
DROP POLICY IF EXISTS "Users can view reviews from own products" ON public.reviews;
CREATE POLICY "Users can view reviews from own products" ON public.reviews
FOR SELECT USING (
  deleted_at IS NULL AND (
    (EXISTS (
      SELECT 1 FROM products p
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE p.id = reviews.product_id AND m.user_id = auth.uid()
    )) OR (EXISTS (
      SELECT 1 FROM marketplaces m
      WHERE m.id = reviews.marketplace_id AND m.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Service role can manage reviews" ON public.reviews;
CREATE POLICY "Service role can manage reviews" ON public.reviews
FOR ALL USING (true) WITH CHECK (true);

-- Questions policies
DROP POLICY IF EXISTS "Users can view questions from own marketplaces" ON public.questions;
CREATE POLICY "Users can view questions from own marketplaces" ON public.questions
FOR SELECT USING (
  deleted_at IS NULL AND (
    EXISTS (
      SELECT 1 FROM marketplaces m
      WHERE m.id = questions.marketplace_id AND m.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Service role can manage questions" ON public.questions;
CREATE POLICY "Service role can manage questions" ON public.questions
FOR ALL USING (true) WITH CHECK (true);

-- Replies policies
DROP POLICY IF EXISTS "Users can view replies from own reviews/questions" ON public.replies;
CREATE POLICY "Users can view replies from own reviews/questions" ON public.replies
FOR SELECT USING (
  deleted_at IS NULL AND (
    (EXISTS (
      SELECT 1 FROM reviews r
      JOIN products p ON p.id = r.product_id
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE r.id = replies.review_id AND m.user_id = auth.uid()
    )) OR (EXISTS (
      SELECT 1 FROM questions q
      JOIN products p ON p.id = q.product_id
      JOIN marketplaces m ON m.id = p.marketplace_id
      WHERE q.id = replies.question_id AND m.user_id = auth.uid()
    ))
  )
);

DROP POLICY IF EXISTS "Users can manage replies from own reviews/questions" ON public.replies;
CREATE POLICY "Users can manage replies from own reviews/questions" ON public.replies
FOR ALL USING (
  (EXISTS (
    SELECT 1 FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE r.id = replies.review_id AND m.user_id = auth.uid()
  )) OR (EXISTS (
    SELECT 1 FROM questions q
    JOIN products p ON p.id = q.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE q.id = replies.question_id AND m.user_id = auth.uid()
  ))
) WITH CHECK (
  (EXISTS (
    SELECT 1 FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE r.id = replies.review_id AND m.user_id = auth.uid()
  )) OR (EXISTS (
    SELECT 1 FROM questions q
    JOIN products p ON p.id = q.product_id
    JOIN marketplaces m ON m.id = p.marketplace_id
    WHERE q.id = replies.question_id AND m.user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Service role can manage replies" ON public.replies;
CREATE POLICY "Service role can manage replies" ON public.replies
FOR ALL USING (true) WITH CHECK (true);

-- =========================================
-- ГОТОВО! Миграции применены
-- =========================================
-- Теперь можно проверить работу расширения:
-- 1. Перезагрузите расширение в Chrome
-- 2. Проверьте консоль браузера - ошибка 500 должна исчезнуть
-- 3. Проверьте, что ответы публикуются
-- =========================================
