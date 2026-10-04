-- Primary streaming platform for the signed-in user. Null means "no preference".
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS default_platform text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_default_platform_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_default_platform_check
  CHECK (
    default_platform IS NULL
    OR default_platform IN ('KICK', 'TWITCH', 'YOUTUBE', 'TIKTOK')
  );

NOTIFY pgrst, 'reload schema';
