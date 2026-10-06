-- Loyalty ranking, shop, and sales for the signed-in creator.
-- Widget kinds used by the Tools sidebar. New enum values are not used in this file.

ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'KICKS_GOAL';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'VIEWER_COUNTER';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'EVENT_LABELS';

CREATE TABLE IF NOT EXISTS public.loyalty_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  level integer NOT NULL DEFAULT 1,
  points integer NOT NULL DEFAULT 0,
  watch_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_members_name_len CHECK (char_length(display_name) BETWEEN 1 AND 80),
  CONSTRAINT loyalty_members_level CHECK (level >= 1 AND level <= 10000),
  CONSTRAINT loyalty_members_points CHECK (points >= 0 AND points <= 100000000),
  CONSTRAINT loyalty_members_watch CHECK (watch_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS loyalty_members_user_points_idx
  ON public.loyalty_members (user_id, points DESC);

CREATE TABLE IF NOT EXISTS public.loyalty_shop_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  cost integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_shop_items_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT loyalty_shop_items_description_len CHECK (char_length(description) <= 400),
  CONSTRAINT loyalty_shop_items_cost CHECK (cost >= 0 AND cost <= 100000000)
);

CREATE UNIQUE INDEX IF NOT EXISTS loyalty_shop_items_user_name_idx
  ON public.loyalty_shop_items (user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.loyalty_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.loyalty_members(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loyalty_sales_item_len CHECK (char_length(item_name) BETWEEN 1 AND 80),
  CONSTRAINT loyalty_sales_points CHECK (points >= 0 AND points <= 100000000)
);

CREATE INDEX IF NOT EXISTS loyalty_sales_user_created_idx
  ON public.loyalty_sales (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_shop_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_sales TO authenticated;
GRANT ALL ON public.loyalty_members TO service_role;
GRANT ALL ON public.loyalty_shop_items TO service_role;
GRANT ALL ON public.loyalty_sales TO service_role;

ALTER TABLE public.loyalty_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage loyalty members" ON public.loyalty_members;
CREATE POLICY "Owners manage loyalty members" ON public.loyalty_members
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage loyalty shop items" ON public.loyalty_shop_items;
CREATE POLICY "Owners manage loyalty shop items" ON public.loyalty_shop_items
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Owners manage loyalty sales" ON public.loyalty_sales;
CREATE POLICY "Owners manage loyalty sales" ON public.loyalty_sales
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS loyalty_members_updated_at ON public.loyalty_members;
CREATE TRIGGER loyalty_members_updated_at
  BEFORE UPDATE ON public.loyalty_members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
