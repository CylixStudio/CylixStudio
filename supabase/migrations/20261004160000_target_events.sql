-- Live target progress: event log and goal milestones that do not require a subathon.

CREATE TABLE IF NOT EXISTS public.target_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform public.platform_type NOT NULL,
  event_type public.rule_event_type NOT NULL,
  provider_event_id text,
  actor_name text,
  actor_platform_id text,
  amount numeric,
  currency text,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS target_events_provider_uidx
  ON public.target_events (platform, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS target_events_user_created_idx
  ON public.target_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.target_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  widget_id uuid NOT NULL REFERENCES public.widgets(id) ON DELETE CASCADE,
  target_value numeric NOT NULL,
  reached_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS target_milestones_goal_target_uidx
  ON public.target_milestones (goal_id, target_value);

CREATE INDEX IF NOT EXISTS target_milestones_user_idx
  ON public.target_milestones (user_id, reached_at DESC);

GRANT SELECT ON public.target_events TO authenticated;
GRANT ALL ON public.target_events TO service_role;
GRANT SELECT ON public.target_milestones TO authenticated;
GRANT ALL ON public.target_milestones TO service_role;

ALTER TABLE public.target_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS target_events_owner_select ON public.target_events;
CREATE POLICY target_events_owner_select
  ON public.target_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS target_milestones_owner_select ON public.target_milestones;
CREATE POLICY target_milestones_owner_select
  ON public.target_milestones
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.target_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
