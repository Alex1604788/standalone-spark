-- Добавляем поддержку рейтингов для шаблонов ответов
-- и переключатели использования шаблонов в настройках маркетплейса

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



