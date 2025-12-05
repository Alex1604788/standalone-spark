-- Создаем таблицу настроек маркетплейсов
CREATE TABLE IF NOT EXISTS public.marketplace_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID NOT NULL REFERENCES public.marketplaces(id) ON DELETE CASCADE,
  
  -- Режимы ответов на отзывы по звёздам
  reviews_mode_1 TEXT DEFAULT 'semi' CHECK (reviews_mode_1 IN ('semi', 'auto')),
  reviews_mode_2 TEXT DEFAULT 'semi' CHECK (reviews_mode_2 IN ('semi', 'auto')),
  reviews_mode_3 TEXT DEFAULT 'semi' CHECK (reviews_mode_3 IN ('semi', 'auto')),
  reviews_mode_4 TEXT DEFAULT 'semi' CHECK (reviews_mode_4 IN ('semi', 'auto')),
  reviews_mode_5 TEXT DEFAULT 'semi' CHECK (reviews_mode_5 IN ('semi', 'auto')),
  
  -- Режим ответов на вопросы
  questions_mode TEXT DEFAULT 'off' CHECK (questions_mode IN ('off', 'semi', 'auto')),
  
  -- Длина ответа
  reply_length TEXT DEFAULT 'normal' CHECK (reply_length IN ('short', 'normal')),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(marketplace_id)
);

-- RLS политики для настроек
ALTER TABLE public.marketplace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own marketplace settings"
  ON public.marketplace_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = marketplace_settings.marketplace_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own marketplace settings"
  ON public.marketplace_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = marketplace_settings.marketplace_id
      AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own marketplace settings"
  ON public.marketplace_settings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = marketplace_settings.marketplace_id
      AND m.user_id = auth.uid()
    )
  );

-- Триггер для обновления updated_at
CREATE TRIGGER update_marketplace_settings_updated_at
  BEFORE UPDATE ON public.marketplace_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Функция для автоматического создания настроек при создании маркетплейса
CREATE OR REPLACE FUNCTION public.create_default_marketplace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.marketplace_settings (marketplace_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_marketplace_settings_trigger
  AFTER INSERT ON public.marketplaces
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_marketplace_settings();