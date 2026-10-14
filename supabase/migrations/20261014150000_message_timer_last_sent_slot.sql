-- Nullable claim key. Existing message_timers rows are left unchanged.
ALTER TABLE public.message_timers
  ADD COLUMN IF NOT EXISTS last_sent_slot text;

COMMENT ON COLUMN public.message_timers.last_sent_slot IS
  'Atomic claim: channelId|timerId|streamSessionId|intervalMinutes|intervalIndex';
