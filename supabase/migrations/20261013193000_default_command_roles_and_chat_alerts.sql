ALTER TABLE public.default_chat_commands
  ADD COLUMN IF NOT EXISTS min_role text NOT NULL DEFAULT 'everyone';

ALTER TABLE public.default_chat_commands DROP CONSTRAINT IF EXISTS default_chat_commands_id_check;
ALTER TABLE public.default_chat_commands
  ADD CONSTRAINT default_chat_commands_id_check
  CHECK (command_id IN (
    'addcom', 'commands', 'delcom', 'editcom', 'followage', 'level', 'points', 'points_add', 'promo', 'shop',
    'lurk', 'so', 'welcome'
  ));

ALTER TABLE public.default_chat_commands DROP CONSTRAINT IF EXISTS default_chat_commands_min_role_check;
ALTER TABLE public.default_chat_commands
  ADD CONSTRAINT default_chat_commands_min_role_check
  CHECK (min_role IN ('everyone', 'subscriber', 'vip', 'og', 'moderator', 'broadcaster'));

CREATE TABLE IF NOT EXISTS public.chat_text_alerts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  template text NOT NULL,
  minimum integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_id),
  CONSTRAINT chat_text_alerts_id_check
    CHECK (alert_id IN ('follow', 'kicks', 'subscription', 'resubscription', 'gift', 'raid', 'welcome')),
  CONSTRAINT chat_text_alerts_template_len CHECK (char_length(template) BETWEEN 1 AND 480),
  CONSTRAINT chat_text_alerts_minimum CHECK (minimum >= 0 AND minimum <= 1000000000)
);

CREATE TABLE IF NOT EXISTS public.chat_text_alert_sends (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_event_id text NOT NULL,
  alert_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_event_id, alert_id)
);

CREATE TABLE IF NOT EXISTS public.chat_text_alert_welcomes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  chatter_key text NOT NULL,
  welcomed_on date NOT NULL,
  PRIMARY KEY (user_id, platform, chatter_key, welcomed_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_text_alerts TO authenticated;
GRANT ALL ON public.chat_text_alerts TO service_role;
GRANT ALL ON public.chat_text_alert_sends TO service_role;
GRANT ALL ON public.chat_text_alert_welcomes TO service_role;

ALTER TABLE public.chat_text_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_text_alert_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_text_alert_welcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage chat text alerts" ON public.chat_text_alerts;
CREATE POLICY "Owners manage chat text alerts" ON public.chat_text_alerts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS chat_text_alerts_updated_at ON public.chat_text_alerts;
CREATE TRIGGER chat_text_alerts_updated_at BEFORE UPDATE ON public.chat_text_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
