-- Sidebar version and admin patch-note broadcasts.
-- Authenticated users may read. Writes stay on the service role after is_admin.

CREATE TABLE IF NOT EXISTS public.studio_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studio_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS studio_settings_authenticated_read ON public.studio_settings;
CREATE POLICY studio_settings_authenticated_read
  ON public.studio_settings
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.studio_settings FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.studio_settings TO authenticated;
GRANT ALL ON TABLE public.studio_settings TO service_role;
