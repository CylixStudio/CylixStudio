alter table public.alerts_studios enable row level security;
alter table public.alerts_media enable row level security;
alter table public.alerts_queue enable row level security;
alter table public.alerts_queue_state enable row level security;
-- All writes use server-checked ownership + is_admin, including workspace grants.
revoke all on public.alerts_studios,public.alerts_media,public.alerts_queue,public.alerts_queue_state from anon,authenticated;
grant select on public.alerts_studios,public.alerts_media,public.alerts_queue,public.alerts_queue_state to authenticated;
grant all on public.alerts_studios,public.alerts_media,public.alerts_queue,public.alerts_queue_state to service_role;
create policy alerts_studios_owner_admin on public.alerts_studios for select to authenticated using(owner_id=auth.uid() and public.is_admin(auth.uid()));
create policy alerts_media_owner_admin on public.alerts_media for select to authenticated using(owner_id=auth.uid() and public.is_admin(auth.uid()));
create policy alerts_queue_owner_admin on public.alerts_queue for select to authenticated using(owner_id=auth.uid() and public.is_admin(auth.uid()));
create policy alerts_state_owner_admin on public.alerts_queue_state for select to authenticated using(owner_id=auth.uid() and public.is_admin(auth.uid()));
