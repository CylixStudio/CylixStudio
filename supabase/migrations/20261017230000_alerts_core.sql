-- Alerts Early Access: additive schema only. Do not apply without release approval.
create table public.alerts_studios (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  overlay_token text not null,
  overlay_token_hash text not null unique,
  settings jsonb not null default '{}'::jsonb,
  simulation jsonb not null default '{}'::jsonb,
  overlay_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.alerts_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.alerts_studios(owner_id) on delete cascade,
  platform text not null check (platform in ('KICK','TWITCH')),
  alert_id text not null,
  slot text not null check (slot in ('visual','audio')),
  variation_key text not null default 'base',
  path text not null,
  name text not null,
  bytes integer not null check (bytes > 0 and bytes <= 62914560),
  mime text not null,
  ext text not null,
  unique (owner_id, platform, alert_id, slot, variation_key)
);
create table public.alerts_queue (
  id uuid primary key,
  owner_id uuid not null references public.alerts_studios(owner_id) on delete cascade,
  event_key text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','claimed','done','skipped')),
  overlay_id uuid,
  claim_id uuid,
  lease_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(owner_id, event_key)
);
create table public.alerts_queue_state (
  owner_id uuid primary key references public.alerts_studios(owner_id) on delete cascade,
  paused boolean not null default false,
  active_overlay_id uuid,
  active_lease_until timestamptz,
  current_id uuid
);
