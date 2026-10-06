-- Shop images, stock, and the active flag shown as متاح / متوقف.
-- `enabled` stays. `is_active` is copied from it once, when the column is added.

ALTER TABLE public.loyalty_shop_items
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.loyalty_shop_items
  ADD COLUMN IF NOT EXISTS stock integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loyalty_shop_items'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.loyalty_shop_items
      ADD COLUMN is_active boolean;
    UPDATE public.loyalty_shop_items
      SET is_active = COALESCE(enabled, true);
    ALTER TABLE public.loyalty_shop_items
      ALTER COLUMN is_active SET DEFAULT true;
    ALTER TABLE public.loyalty_shop_items
      ALTER COLUMN is_active SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loyalty_shop_items_stock'
  ) THEN
    ALTER TABLE public.loyalty_shop_items
      ADD CONSTRAINT loyalty_shop_items_stock CHECK (stock IS NULL OR stock >= 0);
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'loyalty-shop',
  'loyalty-shop',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Loyalty shop: public read" ON storage.objects;
DROP POLICY IF EXISTS "Loyalty shop: owners upload" ON storage.objects;
DROP POLICY IF EXISTS "Loyalty shop: owners update" ON storage.objects;
DROP POLICY IF EXISTS "Loyalty shop: owners delete" ON storage.objects;

CREATE POLICY "Loyalty shop: public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'loyalty-shop');

CREATE POLICY "Loyalty shop: owners upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'loyalty-shop' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Loyalty shop: owners update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'loyalty-shop' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'loyalty-shop' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Loyalty shop: owners delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'loyalty-shop' AND (storage.foldername(name))[1] = auth.uid()::text);
