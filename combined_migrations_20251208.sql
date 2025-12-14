-- ============================================================================
-- ОБЪЕДИНЕННЫЕ МИГРАЦИИ ОТ 08.12.2025
-- ============================================================================
-- 1. Исправление логики calculate_review_segment для отвеченных отзывов
-- 2. Добавление поддержки шаблонов ответов с рейтингами
-- ============================================================================

-- ============================================================================
-- МИГРАЦИЯ 1: Исправление логики calculate_review_segment
-- ============================================================================
-- Если отзыв уже отвечен в Ozon (is_answered = true), он должен попадать в Архив,
-- даже если есть failed/retried replies

CREATE OR REPLACE FUNCTION public.calculate_review_segment(review_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  has_published BOOLEAN;
  has_pending  BOOLEAN;
  v_is_answered BOOLEAN;
BEGIN
  -- Получаем is_answered для данного отзыва
  SELECT is_answered INTO v_is_answered
  FROM reviews 
  WHERE id = calculate_review_segment.review_id;
  
  -- ✅ КРИТИЧНО: Если отзыв уже отвечен в Ozon, он всегда в Архиве
  -- независимо от статуса replies (даже если есть failed/retried)
  IF v_is_answered THEN
    RETURN 'archived';
  END IF;
  
  -- Есть ли опубликованный ответ
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status = 'published'
  ) INTO has_published;
  
  -- АРХИВ: есть опубликованный ответ
  IF has_published THEN
    RETURN 'archived';
  END IF;
  
  -- Есть ли ответы в очереди (ТОЛЬКО scheduled/publishing/failed/retried)
  -- ВАЖНО: "drafted" НЕ включаем - черновики остаются в "unanswered"
  -- ВАЖНО: failed/retried попадают в pending ТОЛЬКО если is_answered = false
  SELECT EXISTS(
    SELECT 1 FROM replies 
    WHERE replies.review_id = calculate_review_segment.review_id 
      AND status IN ('scheduled', 'publishing', 'failed', 'retried')
  ) INTO has_pending;
  
  IF has_pending THEN
    RETURN 'pending';
  END IF;
  
  -- Иначе - не отвечено (включая drafted)
  RETURN 'unanswered';
END;
$function$;

-- Пересчитываем segment для всех отзывов, которые уже отвечены в Ozon,
-- но имеют failed/retried replies (они должны быть в Архиве)
UPDATE reviews r
SET segment = 'archived',
    updated_at = NOW()
WHERE r.is_answered = true
  AND EXISTS (
    SELECT 1 FROM replies rep 
    WHERE rep.review_id = r.id 
      AND rep.status IN ('failed', 'retried')
  )
  AND r.segment != 'archived';

-- ============================================================================
-- МИГРАЦИЯ 2: Добавление поддержки шаблонов ответов с рейтингами
-- ============================================================================

-- 1. Добавляем поле rating в reply_templates (NULL = для всех рейтингов)
ALTER TABLE public.reply_templates 
ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));

-- 2. Добавляем переключатели использования шаблонов в marketplace_settings
ALTER TABLE public.marketplace_settings
ADD COLUMN IF NOT EXISTS use_templates_1 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_templates_2 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_templates_3 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_templates_4 BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS use_templates_5 BOOLEAN DEFAULT false;

-- 3. Создаём индекс для быстрого поиска шаблонов по рейтингу
CREATE INDEX IF NOT EXISTS idx_reply_templates_rating ON public.reply_templates(user_id, rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reply_templates_user_id ON public.reply_templates(user_id);

-- 4. Комментарии для документации
COMMENT ON COLUMN public.reply_templates.rating IS 'Рейтинг отзыва (1-5), для которого предназначен шаблон. NULL = для всех рейтингов';
COMMENT ON COLUMN public.marketplace_settings.use_templates_1 IS 'Использовать шаблоны ответов для отзывов с рейтингом 1';
COMMENT ON COLUMN public.marketplace_settings.use_templates_2 IS 'Использовать шаблоны ответов для отзывов с рейтингом 2';
COMMENT ON COLUMN public.marketplace_settings.use_templates_3 IS 'Использовать шаблоны ответов для отзывов с рейтингом 3';
COMMENT ON COLUMN public.marketplace_settings.use_templates_4 IS 'Использовать шаблоны ответов для отзывов с рейтингом 4';
COMMENT ON COLUMN public.marketplace_settings.use_templates_5 IS 'Использовать шаблоны ответов для отзывов с рейтингом 5';

