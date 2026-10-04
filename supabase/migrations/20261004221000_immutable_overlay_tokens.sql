-- OBS browser-source tokens are minted once per widget or per user.
-- Settings saves and OAuth token refreshes must not rotate them.

CREATE OR REPLACE FUNCTION public.preserve_overlay_capability_token()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME IN ('widgets', 'overlays') THEN
    IF OLD.public_token IS NOT NULL AND btrim(OLD.public_token) <> '' THEN
      NEW.public_token := OLD.public_token;
    END IF;
  ELSIF TG_TABLE_NAME IN ('media_request_settings', 'giveaway_settings') THEN
    IF OLD.overlay_token IS NOT NULL THEN
      NEW.overlay_token := OLD.overlay_token;
    END IF;
  ELSIF TG_TABLE_NAME = 'stream_schedule_settings' THEN
    IF OLD.share_token IS NOT NULL AND btrim(OLD.share_token) <> '' THEN
      NEW.share_token := OLD.share_token;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.widgets') IS NOT NULL THEN
    UPDATE public.widgets
    SET public_token = gen_random_uuid()::text
    WHERE public_token IS NULL OR btrim(public_token) = '';

    DROP TRIGGER IF EXISTS widgets_preserve_public_token ON public.widgets;
    CREATE TRIGGER widgets_preserve_public_token
      BEFORE UPDATE ON public.widgets
      FOR EACH ROW
      EXECUTE FUNCTION public.preserve_overlay_capability_token();
  END IF;

  IF to_regclass('public.overlays') IS NOT NULL THEN
    UPDATE public.overlays
    SET public_token = gen_random_uuid()::text
    WHERE public_token IS NULL OR btrim(public_token) = '';

    DROP TRIGGER IF EXISTS overlays_preserve_public_token ON public.overlays;
    CREATE TRIGGER overlays_preserve_public_token
      BEFORE UPDATE ON public.overlays
      FOR EACH ROW
      EXECUTE FUNCTION public.preserve_overlay_capability_token();
  END IF;

  IF to_regclass('public.media_request_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS media_request_settings_preserve_overlay_token ON public.media_request_settings;
    CREATE TRIGGER media_request_settings_preserve_overlay_token
      BEFORE UPDATE ON public.media_request_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.preserve_overlay_capability_token();
  END IF;

  IF to_regclass('public.giveaway_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS giveaway_settings_preserve_overlay_token ON public.giveaway_settings;
    CREATE TRIGGER giveaway_settings_preserve_overlay_token
      BEFORE UPDATE ON public.giveaway_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.preserve_overlay_capability_token();
  END IF;

  IF to_regclass('public.stream_schedule_settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS stream_schedule_settings_preserve_share_token ON public.stream_schedule_settings;
    CREATE TRIGGER stream_schedule_settings_preserve_share_token
      BEFORE UPDATE ON public.stream_schedule_settings
      FOR EACH ROW
      EXECUTE FUNCTION public.preserve_overlay_capability_token();
  END IF;
END $$;
