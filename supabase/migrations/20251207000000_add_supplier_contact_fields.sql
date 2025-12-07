-- Add contact fields to suppliers table
ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS contact_person TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Add comments for clarity
COMMENT ON COLUMN public.suppliers.contact_person IS 'Контактное лицо';
COMMENT ON COLUMN public.suppliers.phone IS 'Телефон';
COMMENT ON COLUMN public.suppliers.email IS 'Email';
COMMENT ON COLUMN public.suppliers.address IS 'Адрес';
