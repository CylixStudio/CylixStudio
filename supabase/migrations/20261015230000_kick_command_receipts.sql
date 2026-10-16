-- Durable Kick chat-command idempotency. Not applied by this change.
-- A retry of the same Kick event id must not repeat points, shop, giveaway, or mark writes.

CREATE TABLE IF NOT EXISTS public.kick_command_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  broadcaster_user_id text NOT NULL,
  state text NOT NULL,
  reply_text text,
  kick_message_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_event_id),
  CONSTRAINT kick_command_receipts_state_check CHECK (state IN (
    'webhook_received',
    'command_execution_completed',
    'reply_delivery_pending',
    'reply_delivery_succeeded',
    'reply_delivery_failed',
    'reply_delivery_ambiguous'
  )),
  CONSTRAINT kick_command_receipts_event_len CHECK (char_length(provider_event_id) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS kick_command_receipts_kick_message
  ON public.kick_command_receipts (user_id, kick_message_id)
  WHERE kick_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.kick_app_bot_identity (
  client_id text PRIMARY KEY,
  bot_user_id text NOT NULL,
  learned_from_message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kick_app_bot_identity_len CHECK (
    char_length(client_id) BETWEEN 1 AND 80
    AND char_length(bot_user_id) BETWEEN 1 AND 40
  )
);

GRANT ALL ON public.kick_command_receipts TO service_role;
GRANT ALL ON public.kick_app_bot_identity TO service_role;

ALTER TABLE public.kick_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kick_app_bot_identity ENABLE ROW LEVEL SECURITY;
