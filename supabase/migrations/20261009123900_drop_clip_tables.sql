-- Clip command, stored clips, and the Kick live-edge buffer are removed.
-- The storage bucket named clips is left in place.

DROP TABLE IF EXISTS public.kick_stream_buffers CASCADE;
DROP TABLE IF EXISTS public.clips CASCADE;
DROP TABLE IF EXISTS public.clip_command_settings CASCADE;
