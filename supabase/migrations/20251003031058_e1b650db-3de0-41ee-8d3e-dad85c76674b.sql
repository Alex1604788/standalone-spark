-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'operator', 'analyst');

-- Create reply_mode enum
CREATE TYPE public.reply_mode AS ENUM ('manual', 'semi_auto', 'auto');

-- Create reply_status enum
CREATE TYPE public.reply_status AS ENUM ('drafted', 'scheduled', 'published', 'failed', 'retried');

-- Create marketplace_type enum
CREATE TYPE public.marketplace_type AS ENUM ('wildberries', 'ozon', 'yandex_market');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  timezone TEXT DEFAULT 'Europe/Moscow',
  language TEXT DEFAULT 'ru',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create marketplaces table
CREATE TABLE public.marketplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type marketplace_type NOT NULL,
  name TEXT NOT NULL,
  api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.marketplaces ENABLE ROW LEVEL SECURITY;

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id UUID REFERENCES public.marketplaces(id) ON DELETE CASCADE NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10, 2),
  rating DECIMAL(3, 2),
  reviews_count INTEGER DEFAULT 0,
  questions_count INTEGER DEFAULT 0,
  image_url TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (marketplace_id, external_id)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create reviews table
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  external_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  advantages TEXT,
  disadvantages TEXT,
  review_date TIMESTAMPTZ NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, external_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Create questions table
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  external_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  question_date TIMESTAMPTZ NOT NULL,
  is_answered BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, external_id)
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- Create reply_templates table
CREATE TABLE public.reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  tone TEXT DEFAULT 'friendly',
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.reply_templates ENABLE ROW LEVEL SECURITY;

-- Create replies table
CREATE TABLE public.replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.questions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  status reply_status DEFAULT 'drafted',
  mode reply_mode NOT NULL,
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  can_cancel_until TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((review_id IS NOT NULL AND question_id IS NULL) OR (review_id IS NULL AND question_id IS NOT NULL))
);

ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;

-- Create audit_log table
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  
  -- Assign owner role to the first user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'owner');
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user registration
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add update triggers to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_marketplaces_updated_at BEFORE UPDATE ON public.marketplaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reply_templates_updated_at BEFORE UPDATE ON public.reply_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_replies_updated_at BEFORE UPDATE ON public.replies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Owners can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- RLS Policies for marketplaces
CREATE POLICY "Users can view own marketplaces"
  ON public.marketplaces FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own marketplaces"
  ON public.marketplaces FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for products
CREATE POLICY "Users can view products from own marketplaces"
  ON public.products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = products.marketplace_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage products from own marketplaces"
  ON public.products FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = products.marketplace_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.marketplaces m
      WHERE m.id = products.marketplace_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for reviews
CREATE POLICY "Users can view reviews from own products"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE p.id = reviews.product_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for questions
CREATE POLICY "Users can view questions from own products"
  ON public.questions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE p.id = questions.product_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for reply_templates
CREATE POLICY "Users can view own templates"
  ON public.reply_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own templates"
  ON public.reply_templates FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for replies
CREATE POLICY "Users can view replies from own reviews/questions"
  ON public.replies FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE r.id = replies.review_id AND m.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.products p ON p.id = q.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE q.id = replies.question_id AND m.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage replies from own reviews/questions"
  ON public.replies FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reviews r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE r.id = replies.review_id AND m.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.products p ON p.id = q.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE q.id = replies.question_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reviews r
      JOIN public.products p ON p.id = r.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE r.id = replies.review_id AND m.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.questions q
      JOIN public.products p ON p.id = q.product_id
      JOIN public.marketplaces m ON m.id = p.marketplace_id
      WHERE q.id = replies.question_id AND m.user_id = auth.uid()
    )
  );

-- RLS Policies for audit_log
CREATE POLICY "Admins can view audit logs"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "System can insert audit logs"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);