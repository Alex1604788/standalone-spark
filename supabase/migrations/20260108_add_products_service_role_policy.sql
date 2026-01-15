-- Add service role policy for products table to allow JOIN in queries
-- This matches the policy already present on reviews and questions tables

DROP POLICY IF EXISTS "Service role can manage products" ON public.products;
CREATE POLICY "Service role can manage products"
ON public.products
FOR ALL
USING (true)
WITH CHECK (true);
