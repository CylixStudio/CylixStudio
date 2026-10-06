-- Public command list and store for a published link-in-bio slug.
-- Anon can read enabled commands and active shop items only.
-- Loyalty members and sales stay owner-only.

CREATE OR REPLACE FUNCTION public.channel_has_published_slug(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.link_in_bio_profiles
    WHERE user_id = p_user_id
      AND published = true
      AND slug IS NOT NULL
      AND btrim(slug) <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.channel_has_published_slug(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_has_published_slug(uuid) TO anon, authenticated, service_role;

GRANT SELECT (name, prefix, response) ON TABLE public.custom_chat_commands TO anon;
GRANT SELECT (name, description, cost, image_url, stock) ON TABLE public.loyalty_shop_items TO anon;

DROP POLICY IF EXISTS "Public reads enabled commands for published channels" ON public.custom_chat_commands;
CREATE POLICY "Public reads enabled commands for published channels"
  ON public.custom_chat_commands
  FOR SELECT
  TO anon
  USING (enabled = true AND public.channel_has_published_slug(user_id));

DROP POLICY IF EXISTS "Public reads active shop items for published channels" ON public.loyalty_shop_items;
CREATE POLICY "Public reads active shop items for published channels"
  ON public.loyalty_shop_items
  FOR SELECT
  TO anon
  USING (is_active = true AND public.channel_has_published_slug(user_id));

CREATE OR REPLACE FUNCTION public.purchase_loyalty_item(
  p_user_id uuid,
  p_member_id uuid,
  p_item_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_cost integer;
  v_stock integer;
  v_points integer;
  v_active boolean;
BEGIN
  SELECT name, cost, stock, is_active
  INTO v_name, v_cost, v_stock, v_active
  FROM public.loyalty_shop_items
  WHERE id = p_item_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_item');
  END IF;

  IF v_stock IS NOT NULL AND v_stock < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_stock');
  END IF;

  SELECT points INTO v_points
  FROM public.loyalty_members
  WHERE id = p_member_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_points IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_member');
  END IF;

  IF v_points < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_points');
  END IF;

  UPDATE public.loyalty_members
  SET points = points - v_cost, updated_at = now()
  WHERE id = p_member_id AND user_id = p_user_id AND points >= v_cost;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_points');
  END IF;

  IF v_stock IS NOT NULL THEN
    UPDATE public.loyalty_shop_items
    SET stock = stock - 1
    WHERE id = p_item_id AND user_id = p_user_id AND stock >= 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'loyalty_stock_conflict';
    END IF;
  END IF;

  INSERT INTO public.loyalty_sales (user_id, member_id, item_name, points)
  VALUES (p_user_id, p_member_id, v_name, v_cost);

  RETURN jsonb_build_object('ok', true, 'item_name', v_name, 'points', v_cost);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_loyalty_item(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_loyalty_item(uuid, uuid, uuid) TO service_role;
