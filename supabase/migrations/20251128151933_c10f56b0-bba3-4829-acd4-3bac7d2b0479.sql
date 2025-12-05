-- Добавление soft delete и расширенного логирования

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

-- 5. Создаем представления для фильтрации неудаленных записей
CREATE OR REPLACE VIEW public.active_reviews AS
SELECT * FROM public.reviews WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.active_questions AS
SELECT * FROM public.questions WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.active_replies AS
SELECT * FROM public.replies WHERE deleted_at IS NULL;

-- 6. Функция для восстановления удаленных записей
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