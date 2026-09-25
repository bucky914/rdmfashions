-- RDM Fashions: fix order_items.product_id UUID -> TEXT
-- Run this once in Supabase SQL Editor.

-- The existing foreign key expects product_id to match a UUID column.
-- This project uses the product slug 'microfiber-cloth' instead,
-- so remove the old UUID foreign key first.
ALTER TABLE public.order_items
DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

-- Convert the existing product_id column from UUID to TEXT.
ALTER TABLE public.order_items
ALTER COLUMN product_id TYPE text
USING product_id::text;

-- Ensure the current product slug is the default.
ALTER TABLE public.order_items
ALTER COLUMN product_id SET DEFAULT 'microfiber-cloth';

-- Refresh PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
