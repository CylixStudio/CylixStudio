-- Link-in-bio cards. The app reads and writes public.link_in_bio_links
-- (save, publish, and the public page). Idempotent so a project that already
-- has this table keeps its rows and only fills gaps.

CREATE TABLE IF NOT EXISTS public.link_in_bio_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  url text NOT NULL,
  platform text NOT NULL DEFAULT 'custom',
  card_size text NOT NULL DEFAULT 'inherit',
  sort_order integer NOT NULL DEFAULT 0,
  featured boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  kind text NOT NULL DEFAULT 'link',
  grid_x integer NOT NULL DEFAULT 0,
  grid_y integer NOT NULL DEFAULT 0,
  col_span integer NOT NULL DEFAULT 1,
  row_span integer NOT NULL DEFAULT 1,
  gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS url text;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'custom';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS card_size text NOT NULL DEFAULT 'inherit';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'link';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS grid_x integer NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS grid_y integer NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS col_span integer NOT NULL DEFAULT 1;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS row_span integer NOT NULL DEFAULT 1;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS gallery_images jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'link_in_bio_links_user_id_fkey'
      AND conrelid = 'public.link_in_bio_links'::regclass
  ) THEN
    ALTER TABLE public.link_in_bio_links
      ADD CONSTRAINT link_in_bio_links_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.link_in_bio_profiles(user_id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_title_len;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_title_len CHECK (char_length(title) BETWEEN 1 AND 80);

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_url_len;
ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_url_ok;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_url_ok CHECK (
    (kind = 'gallery' AND char_length(url) <= 2048)
    OR (kind = 'link' AND char_length(url) BETWEEN 8 AND 2048)
  );

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_platform;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_platform CHECK (
    platform IN (
      'kick',
      'twitch',
      'youtube',
      'tiktok',
      'instagram',
      'snapchat',
      'x',
      'discord',
      'whatsapp',
      'custom'
    )
  );

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_card;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_card CHECK (card_size IN ('inherit', 's', 'm', 'l'));

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_kind;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_kind CHECK (kind IN ('link', 'gallery'));

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_grid_x;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_grid_x CHECK (grid_x BETWEEN 0 AND 3);

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_grid_y;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_grid_y CHECK (grid_y BETWEEN 0 AND 40);

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_col_span;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_col_span CHECK (col_span IN (1, 2));

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_row_span;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_row_span CHECK (row_span IN (1, 2));

ALTER TABLE public.link_in_bio_links DROP CONSTRAINT IF EXISTS link_in_bio_links_gallery;
ALTER TABLE public.link_in_bio_links
  ADD CONSTRAINT link_in_bio_links_gallery CHECK (jsonb_typeof(gallery_images) = 'array');

CREATE INDEX IF NOT EXISTS link_in_bio_links_user_order_idx
  ON public.link_in_bio_links (user_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_in_bio_links TO authenticated;
GRANT ALL ON public.link_in_bio_links TO service_role;

ALTER TABLE public.link_in_bio_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage link-in-bio links" ON public.link_in_bio_links;
CREATE POLICY "Owners manage link-in-bio links"
  ON public.link_in_bio_links
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS link_in_bio_links_updated_at ON public.link_in_bio_links;
CREATE TRIGGER link_in_bio_links_updated_at
  BEFORE UPDATE ON public.link_in_bio_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
