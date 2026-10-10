-- Channel access grants: a channel owner (auth user id) grants a member
-- (auth user id) moderator or other access. Members may read only their own
-- grants. Inserts and updates stay on the service role.

CREATE TABLE IF NOT EXISTS public.channel_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('moderator', 'granted')),
  permissions text[] NOT NULL DEFAULT ARRAY['workspace']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_access_grants_owner_member_unique UNIQUE (owner_user_id, member_user_id),
  CONSTRAINT channel_access_grants_not_self CHECK (owner_user_id <> member_user_id)
);

CREATE INDEX IF NOT EXISTS channel_access_grants_member_idx
  ON public.channel_access_grants (member_user_id);

ALTER TABLE public.channel_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_access_grants_member_read ON public.channel_access_grants;
CREATE POLICY channel_access_grants_member_read
  ON public.channel_access_grants
  FOR SELECT
  TO authenticated
  USING (member_user_id = auth.uid());

REVOKE ALL ON TABLE public.channel_access_grants FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.channel_access_grants TO authenticated;
GRANT ALL ON TABLE public.channel_access_grants TO service_role;
