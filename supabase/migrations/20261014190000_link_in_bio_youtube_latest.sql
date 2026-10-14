-- Per-bio toggle for the latest YouTube videos section.
-- Default true keeps existing pages showing latest videos until an owner turns it off.
-- Not applied by the app. Run it yourself when you are ready.

ALTER TABLE public.link_in_bio_themes
  ADD COLUMN IF NOT EXISTS youtube_latest_enabled boolean NOT NULL DEFAULT true;
