-- Add payment delay and delivery time fields to suppliers table

ALTER TABLE public.suppliers
ADD COLUMN IF NOT EXISTS payment_delay_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS delivery_time_days INTEGER DEFAULT 0;

COMMENT ON COLUMN public.suppliers.payment_delay_days IS 'Отсрочка платежа в днях';
COMMENT ON COLUMN public.suppliers.delivery_time_days IS 'Срок поставки товара в днях';
