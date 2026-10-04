-- =============================================================================
-- CylixStudio master reconcile migration (IDEMPOTENT)
-- Timestamp: 20260926180000
-- Aligns public schema with src/lib/supabase/types.ts + prior migrations.
-- Safe to re-run: CREATE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DROP/CREATE
-- policies, DO-block FKs, enum CREATE + ADD VALUE IF NOT EXISTS.
-- =============================================================================
--
-- AUDIT MAP (features → tables)
-- -----------------------------------------------------------------------------
-- Auth / profile .......... users, accounts, sessions, user_roles
-- Platform OAuth .......... platform_connections
-- Subathon / overlays ..... subathons, overlays, timer_states, events, rules
-- Widgets / goals ......... widgets, goals
-- Audit ................... audit_logs
-- Pro / billing ........... user_subscriptions, activation_codes, pro_purchases
-- Clips ................... clips, clip_command_settings, kick_stream_buffers
-- Chat commands ........... custom_chat_command_settings, custom_chat_commands,
--                           default_chat_commands, message_timers
-- Giveaways ............... giveaway_settings, giveaway_participants
-- Media requests .......... media_request_settings, media_requests,
--                           media_playback_state
-- Stream marks ............ stream_marks, mark_point_settings, mark_point_allowlist
-- Stream schedule ......... stream_schedule_settings, stream_schedule_slots
-- Link-in-bio ............. link_in_bio_profiles, link_in_bio_themes,
--                           link_in_bio_links
-- Storage buckets ......... clips, link-in-bio, schedule-covers
-- =============================================================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1) set_updated_at()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2) Enums (create if missing, then add all final values)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.timer_status AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'ENDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.platform_type AS ENUM (
    'TWITCH', 'KICK', 'STREAMELEMENTS', 'STREAMLABS', 'MANUAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.rule_event_type AS ENUM (
    'FOLLOW', 'SUBSCRIPTION', 'GIFT_SUB', 'BITS', 'DONATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.widget_type AS ENUM (
    'SUBATHON_TIMER', 'GOAL_BAR', 'ALERT_BOX', 'CHAT_BOX', 'SPIN_WHEEL'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- platform_type final set
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'TWITCH';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'KICK';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'STREAMELEMENTS';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'STREAMLABS';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'MANUAL';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'TIKTOK';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'YOUTUBE';
ALTER TYPE public.platform_type ADD VALUE IF NOT EXISTS 'X';

-- rule_event_type final set
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'FOLLOW';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'SUBSCRIPTION';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'GIFT_SUB';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'BITS';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'DONATION';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'RAID';
ALTER TYPE public.rule_event_type ADD VALUE IF NOT EXISTS 'LIKE';

-- widget_type final set
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'SUBATHON_TIMER';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'GOAL_BAR';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'ALERT_BOX';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'CHAT_BOX';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'SPIN_WHEEL';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'EMOTE_RAIN';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'CHAT_SPOTLIGHT';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'STREAM_EVENTS_SCHEDULE';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'TIKTOK_TAPPERS';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'TIKTOK_TAP_GOAL';

-- timer_status / app_role (ensure present)
ALTER TYPE public.timer_status ADD VALUE IF NOT EXISTS 'IDLE';
ALTER TYPE public.timer_status ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE public.timer_status ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE public.timer_status ADD VALUE IF NOT EXISTS 'ENDED';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';

-- -----------------------------------------------------------------------------
-- 3) Core tables
-- -----------------------------------------------------------------------------

-- users (profile mirrored from auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  name TEXT,
  image TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- accounts (OAuth account links)
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'oauth',
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounts_provider_unique UNIQUE (provider, provider_account_id)
);
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'oauth';
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS provider_account_id TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS expires_at BIGINT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS token_type TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS id_token TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS session_state TEXT;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS session_token TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS expires TIMESTAMPTZ;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- platform_connections
CREATE TABLE IF NOT EXISTS public.platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform public.platform_type NOT NULL,
  platform_user_id TEXT,
  username TEXT,
  access_token TEXT,
  refresh_token TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_connections_unique UNIQUE (user_id, platform, platform_user_id)
);
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS platform public.platform_type;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS platform_user_id TEXT;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS refresh_token TEXT;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.platform_connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- subathons
CREATE TABLE IF NOT EXISTS public.subathons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  initial_seconds INTEGER NOT NULL DEFAULT 3600,
  max_duration_seconds INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subathons_slug_unique UNIQUE (user_id, slug)
);
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS initial_seconds INTEGER NOT NULL DEFAULT 3600;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS max_duration_seconds INTEGER;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.subathons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- overlays
CREATE TABLE IF NOT EXISTS public.overlays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subathon_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default overlay',
  public_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  is_public BOOLEAN NOT NULL DEFAULT true,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Default overlay';
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS theme JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.overlays ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- timer_states
CREATE TABLE IF NOT EXISTS public.timer_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subathon_id UUID NOT NULL UNIQUE,
  status public.timer_status NOT NULL DEFAULT 'IDLE',
  remaining_seconds INTEGER NOT NULL DEFAULT 0,
  total_added_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  last_tick_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS status public.timer_status NOT NULL DEFAULT 'IDLE';
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS remaining_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS total_added_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS last_tick_at TIMESTAMPTZ;
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.timer_states ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subathon_id UUID NOT NULL,
  platform public.platform_type NOT NULL,
  event_type public.rule_event_type NOT NULL,
  provider_event_id TEXT,
  actor_name TEXT,
  actor_platform_id TEXT,
  amount NUMERIC(12, 2),
  quantity INTEGER NOT NULL DEFAULT 1,
  currency TEXT,
  seconds_added INTEGER NOT NULL DEFAULT 0,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_provider_dedup UNIQUE (platform, provider_event_id)
);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS platform public.platform_type;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type public.rule_event_type;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS provider_event_id TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS actor_platform_id TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS seconds_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- widgets (before rules.widget_id / goals)
CREATE TABLE IF NOT EXISTS public.widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subathon_id UUID,
  name TEXT NOT NULL DEFAULT 'Untitled widget',
  type public.widget_type NOT NULL DEFAULT 'SUBATHON_TIMER',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  public_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Untitled widget';
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS type public.widget_type NOT NULL DEFAULT 'SUBATHON_TIMER';
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS public_token TEXT;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.widgets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- rules
CREATE TABLE IF NOT EXISTS public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subathon_id UUID NOT NULL,
  platform public.platform_type NOT NULL DEFAULT 'MANUAL',
  event_type public.rule_event_type NOT NULL,
  seconds_per_unit INTEGER NOT NULL DEFAULT 0,
  unit_amount NUMERIC(12, 2) NOT NULL DEFAULT 1,
  min_amount NUMERIC(12, 2),
  max_seconds_per_event INTEGER,
  priority INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  widget_id UUID,
  goal_increment NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rules_unique_per_event UNIQUE (subathon_id, platform, event_type)
);
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS platform public.platform_type NOT NULL DEFAULT 'MANUAL';
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS event_type public.rule_event_type;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS seconds_per_unit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS unit_amount NUMERIC(12, 2) NOT NULL DEFAULT 1;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS min_amount NUMERIC(12, 2);
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS max_seconds_per_event INTEGER;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS widget_id UUID;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS goal_increment NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.rules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- goals
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Goal',
  unit TEXT NOT NULL DEFAULT 'USD',
  target_value NUMERIC(14, 2) NOT NULL DEFAULT 100,
  current_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS widget_id UUID;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Goal';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS target_value NUMERIC(14, 2) NOT NULL DEFAULT 100;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS current_value NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  subathon_id UUID,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS subathon_id UUID;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role public.app_role;
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- user_subscriptions
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY,
  subscription_status TEXT NOT NULL DEFAULT 'inactive',
  expires_at TIMESTAMPTZ,
  active_code TEXT,
  is_lifetime BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS active_code TEXT;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS is_lifetime BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_subscriptions_status_check'
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_status_check
      CHECK (subscription_status IN ('active', 'expired', 'inactive'));
  END IF;
END $$;

-- activation_codes
CREATE TABLE IF NOT EXISTS public.activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  duration_days INTEGER NOT NULL DEFAULT 30,
  is_used BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  used_by_user_id UUID,
  created_by UUID,
  purchaser_user_id UUID,
  purchase_id UUID,
  source TEXT NOT NULL DEFAULT 'admin',
  notes TEXT,
  redeemed_by_email TEXT,
  code_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS is_used BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS used_by_user_id UUID;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS purchaser_user_id UUID;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS purchase_id UUID;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS redeemed_by_email TEXT;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ;
ALTER TABLE public.activation_codes ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activation_codes_source_check'
  ) THEN
    ALTER TABLE public.activation_codes
      ADD CONSTRAINT activation_codes_source_check
      CHECK (source IN ('admin', 'purchase', 'manual'));
  END IF;
END $$;

-- pro_purchases
CREATE TABLE IF NOT EXISTS public.pro_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email TEXT NOT NULL,
  billing_interval TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  amount_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT 'checkout',
  provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  purchase_type TEXT NOT NULL DEFAULT 'gift',
  gift_recipient_email TEXT,
  gift_message TEXT,
  activation_code_id UUID,
  code_delivered_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pro_purchases_provider_payment_unique UNIQUE (provider, provider_payment_id)
);
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS billing_interval TEXT;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS duration_days INTEGER;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS amount_cents INTEGER;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'checkout';
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS purchase_type TEXT NOT NULL DEFAULT 'gift';
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS gift_recipient_email TEXT;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS activation_code_id UUID;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS code_delivered_at TIMESTAMPTZ;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.pro_purchases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_purchases_interval_check') THEN
    ALTER TABLE public.pro_purchases ADD CONSTRAINT pro_purchases_interval_check
      CHECK (billing_interval IN ('monthly', 'six_months', 'yearly', 'lifetime', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_purchases_status_check') THEN
    ALTER TABLE public.pro_purchases ADD CONSTRAINT pro_purchases_status_check
      CHECK (status IN ('paid', 'refunded', 'failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pro_purchases_purchase_type_check') THEN
    ALTER TABLE public.pro_purchases ADD CONSTRAINT pro_purchases_purchase_type_check
      CHECK (purchase_type IN ('direct', 'gift'));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Feature tables: clips, chat, giveaway, media, marks, schedule, link-in-bio
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.clip_command_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  roles TEXT[] NOT NULL DEFAULT ARRAY['Everyone']::text[],
  default_length INTEGER NOT NULL DEFAULT 30,
  max_length INTEGER NOT NULL DEFAULT 120,
  response TEXT NOT NULL DEFAULT '@{user} {clip_url}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['Everyone']::text[];
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS default_length INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS max_length INTEGER NOT NULL DEFAULT 120;
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS response TEXT NOT NULL DEFAULT '@{user} {clip_url}';
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.clip_command_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform public.platform_type NOT NULL DEFAULT 'KICK',
  external_id TEXT,
  title TEXT NOT NULL DEFAULT 'Clip',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  share_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  view_count INTEGER NOT NULL DEFAULT 0,
  clipped_by TEXT NOT NULL DEFAULT 'viewer',
  clipped_by_platform_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS platform public.platform_type NOT NULL DEFAULT 'KICK';
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Clip';
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS share_url TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS duration_seconds INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS clipped_by TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS clipped_by_platform_id TEXT;
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.clips ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.kick_stream_buffers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  variant_url TEXT,
  variant_refreshed_at TIMESTAMPTZ,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kick_stream_buffers ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.kick_stream_buffers ADD COLUMN IF NOT EXISTS variant_url TEXT;
ALTER TABLE public.kick_stream_buffers ADD COLUMN IF NOT EXISTS variant_refreshed_at TIMESTAMPTZ;
ALTER TABLE public.kick_stream_buffers ADD COLUMN IF NOT EXISTS segments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.kick_stream_buffers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.custom_chat_command_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_prefix TEXT NOT NULL DEFAULT '!',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_chat_command_settings ADD COLUMN IF NOT EXISTS default_prefix TEXT NOT NULL DEFAULT '!';
ALTER TABLE public.custom_chat_command_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.custom_chat_command_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.custom_chat_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT,
  response TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK', 'TWITCH']::text[],
  roles TEXT[] NOT NULL DEFAULT ARRAY['Everyone']::text[],
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS prefix TEXT;
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK', 'TWITCH']::text[];
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['Everyone']::text[];
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.custom_chat_commands ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.custom_chat_commands SET name = 'command' WHERE name IS NULL OR btrim(name) = '';
UPDATE public.custom_chat_commands SET response = '{user}' WHERE response IS NULL OR btrim(response) = '';
ALTER TABLE public.custom_chat_commands ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.custom_chat_commands ALTER COLUMN response SET NOT NULL;

ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_name_format;
ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_name_ascii;
ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_name_len;
ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_prefix_len;
ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_response_len;
ALTER TABLE public.custom_chat_commands DROP CONSTRAINT IF EXISTS custom_chat_commands_cooldown;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_chat_commands_name_len') THEN
    ALTER TABLE public.custom_chat_commands
      ADD CONSTRAINT custom_chat_commands_name_len CHECK (char_length(name) BETWEEN 1 AND 32);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_chat_commands_prefix_len') THEN
    ALTER TABLE public.custom_chat_commands
      ADD CONSTRAINT custom_chat_commands_prefix_len CHECK (prefix IS NULL OR char_length(prefix) <= 8);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_chat_commands_response_len') THEN
    ALTER TABLE public.custom_chat_commands
      ADD CONSTRAINT custom_chat_commands_response_len CHECK (char_length(response) BETWEEN 1 AND 480);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_chat_commands_cooldown') THEN
    ALTER TABLE public.custom_chat_commands
      ADD CONSTRAINT custom_chat_commands_cooldown CHECK (cooldown_seconds >= 0 AND cooldown_seconds <= 3600);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.default_chat_commands (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  response TEXT NOT NULL,
  fallback_response TEXT NOT NULL DEFAULT '',
  platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK', 'TWITCH']::text[],
  cooldown_seconds INTEGER NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, command_id)
);
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS response TEXT;
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS fallback_response TEXT NOT NULL DEFAULT '';
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK', 'TWITCH']::text[];
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.default_chat_commands ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'default_chat_commands_id_check') THEN
    ALTER TABLE public.default_chat_commands ADD CONSTRAINT default_chat_commands_id_check
      CHECK (command_id IN ('commands', 'followage', 'lurk', 'so', 'welcome'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.message_timers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  enabled BOOLEAN NOT NULL DEFAULT true,
  platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK']::text[],
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS interval_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT ARRAY['KICK']::text[];
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.message_timers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.giveaway_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL DEFAULT '+1',
  sub_multiplier INTEGER NOT NULL DEFAULT 1,
  subs_only BOOLEAN NOT NULL DEFAULT false,
  spin_duration INTEGER NOT NULL DEFAULT 5,
  claim_seconds INTEGER NOT NULL DEFAULT 120,
  is_open BOOLEAN NOT NULL DEFAULT true,
  last_winner JSONB,
  overlay_token UUID NOT NULL DEFAULT gen_random_uuid(),
  draw_state JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS keyword TEXT NOT NULL DEFAULT '+1';
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS sub_multiplier INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS subs_only BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS spin_duration INTEGER NOT NULL DEFAULT 5;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS claim_seconds INTEGER NOT NULL DEFAULT 120;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS last_winner JSONB;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS overlay_token UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS draw_state JSONB;
ALTER TABLE public.giveaway_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.giveaway_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  entries INTEGER NOT NULL DEFAULT 1,
  is_subscriber BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, username)
);
ALTER TABLE public.giveaway_participants ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE public.giveaway_participants ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.giveaway_participants ADD COLUMN IF NOT EXISTS entries INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.giveaway_participants ADD COLUMN IF NOT EXISTS is_subscriber BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.giveaway_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.media_request_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  kick_reward_id TEXT,
  require_approval BOOLEAN NOT NULL DEFAULT true,
  request_mode TEXT NOT NULL DEFAULT 'MANUAL',
  max_duration_seconds INTEGER NOT NULL DEFAULT 300,
  min_view_count BIGINT NOT NULL DEFAULT 1000,
  keyword_blacklist TEXT[] NOT NULL DEFAULT '{}',
  user_blacklist TEXT[] NOT NULL DEFAULT '{}',
  display_mode TEXT NOT NULL DEFAULT 'VIDEO',
  player_layout TEXT NOT NULL DEFAULT 'VERTICAL_CARD',
  volume INTEGER NOT NULL DEFAULT 80,
  overlay_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  mod_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS kick_reward_id TEXT;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS request_mode TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS max_duration_seconds INTEGER NOT NULL DEFAULT 300;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS min_view_count BIGINT NOT NULL DEFAULT 1000;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS keyword_blacklist TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS user_blacklist TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS display_mode TEXT NOT NULL DEFAULT 'VIDEO';
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS player_layout TEXT NOT NULL DEFAULT 'VERTICAL_CARD';
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS volume INTEGER NOT NULL DEFAULT 80;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS overlay_token TEXT;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS mod_token TEXT;
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.media_request_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.media_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider_event_id TEXT,
  reward_redemption_id TEXT,
  reward_id TEXT,
  requester_platform_id TEXT,
  requester_username TEXT NOT NULL,
  requester_avatar_url TEXT,
  youtube_video_id TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_seconds INTEGER NOT NULL,
  view_count BIGINT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  position BIGINT,
  rejection_reason TEXT,
  refunded_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ,
  platform TEXT NOT NULL DEFAULT 'YOUTUBE',
  artist TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS provider_event_id TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS reward_redemption_id TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS reward_id TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS requester_platform_id TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS requester_username TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS requester_avatar_url TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS view_count BIGINT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS position BIGINT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'YOUTUBE';
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS artist TEXT;
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.media_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.media_playback_state (
  user_id UUID PRIMARY KEY,
  current_request_id UUID,
  playback_status TEXT NOT NULL DEFAULT 'IDLE',
  position_seconds NUMERIC(12, 3) NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  volume INTEGER NOT NULL DEFAULT 80,
  revision BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS current_request_id UUID;
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS playback_status TEXT NOT NULL DEFAULT 'IDLE';
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS position_seconds NUMERIC(12, 3) NOT NULL DEFAULT 0;
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS volume INTEGER NOT NULL DEFAULT 80;
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.media_playback_state ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stream_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  author TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'KICK',
  note TEXT NOT NULL DEFAULT '',
  viewer_is_mod BOOLEAN NOT NULL DEFAULT false,
  uptime_start_seconds INTEGER,
  uptime_end_seconds INTEGER,
  stream_started_at TIMESTAMPTZ,
  offline BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'KICK';
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS viewer_is_mod BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS uptime_start_seconds INTEGER;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS uptime_end_seconds INTEGER;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS stream_started_at TIMESTAMPTZ;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS offline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.stream_marks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.mark_point_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(18), 'hex'),
  kick_username TEXT NOT NULL DEFAULT '',
  cached_staff TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mark_point_settings ADD COLUMN IF NOT EXISTS share_token TEXT;
ALTER TABLE public.mark_point_settings ADD COLUMN IF NOT EXISTS kick_username TEXT NOT NULL DEFAULT '';
ALTER TABLE public.mark_point_settings ADD COLUMN IF NOT EXISTS cached_staff TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE public.mark_point_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.mark_point_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.mark_point_allowlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mark_point_allowlist ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.mark_point_allowlist ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stream_schedule_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  title TEXT NOT NULL DEFAULT 'Stream schedule',
  reminder_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS share_token TEXT;
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Stream schedule';
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS reminder_note TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.stream_schedule_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.stream_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL,
  start_minutes INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 180,
  game TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  occurs_on DATE,
  cover_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS weekday SMALLINT;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS start_minutes INTEGER;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 180;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS occurs_on DATE;
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.stream_schedule_slots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.link_in_bio_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  header_url TEXT NOT NULL DEFAULT '',
  published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  setup_completed BOOLEAN NOT NULL DEFAULT false,
  username_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS header_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.link_in_bio_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.link_in_bio_themes (
  user_id UUID PRIMARY KEY,
  glass_intensity INTEGER NOT NULL DEFAULT 45,
  hairline_borders BOOLEAN NOT NULL DEFAULT true,
  glow_strength INTEGER NOT NULL DEFAULT 35,
  gradient_style TEXT NOT NULL DEFAULT 'soft',
  font_family TEXT NOT NULL DEFAULT 'manrope',
  font_custom_name TEXT NOT NULL DEFAULT '',
  font_custom_href TEXT NOT NULL DEFAULT '',
  palette_bg TEXT NOT NULL DEFAULT '#0f1117',
  palette_fg TEXT NOT NULL DEFAULT '#f4f4f5',
  palette_accent TEXT NOT NULL DEFAULT '#7c8cff',
  palette_muted TEXT NOT NULL DEFAULT '#a1a1aa',
  surface_style TEXT NOT NULL DEFAULT 'glass',
  layout TEXT NOT NULL DEFAULT 'bento',
  default_card_size TEXT NOT NULL DEFAULT 'm',
  ambient_enabled BOOLEAN NOT NULL DEFAULT true,
  ambient_preset TEXT NOT NULL DEFAULT 'glow',
  schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  widget_banner_url TEXT NOT NULL DEFAULT '',
  countdown_enabled BOOLEAN NOT NULL DEFAULT false,
  countdown_label TEXT NOT NULL DEFAULT 'Going live',
  countdown_ends_at TIMESTAMPTZ,
  bento_color_mode TEXT NOT NULL DEFAULT 'brand',
  bento_custom_fill TEXT NOT NULL DEFAULT '#1a1c24',
  bento_custom_accent TEXT NOT NULL DEFAULT '#7c8cff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS glass_intensity INTEGER NOT NULL DEFAULT 45;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS hairline_borders BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS glow_strength INTEGER NOT NULL DEFAULT 35;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS gradient_style TEXT NOT NULL DEFAULT 'soft';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS font_family TEXT NOT NULL DEFAULT 'manrope';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS font_custom_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS font_custom_href TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS palette_bg TEXT NOT NULL DEFAULT '#0f1117';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS palette_fg TEXT NOT NULL DEFAULT '#f4f4f5';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS palette_accent TEXT NOT NULL DEFAULT '#7c8cff';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS palette_muted TEXT NOT NULL DEFAULT '#a1a1aa';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS surface_style TEXT NOT NULL DEFAULT 'glass';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS layout TEXT NOT NULL DEFAULT 'bento';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS default_card_size TEXT NOT NULL DEFAULT 'm';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS ambient_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS ambient_preset TEXT NOT NULL DEFAULT 'glow';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS widget_banner_url TEXT NOT NULL DEFAULT '';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS countdown_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS countdown_label TEXT NOT NULL DEFAULT 'Going live';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS countdown_ends_at TIMESTAMPTZ;
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS bento_color_mode TEXT NOT NULL DEFAULT 'brand';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS bento_custom_fill TEXT NOT NULL DEFAULT '#1a1c24';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS bento_custom_accent TEXT NOT NULL DEFAULT '#7c8cff';
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.link_in_bio_themes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.link_in_bio_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'custom',
  card_size TEXT NOT NULL DEFAULT 'inherit',
  sort_order INTEGER NOT NULL DEFAULT 0,
  featured BOOLEAN NOT NULL DEFAULT false,
  enabled BOOLEAN NOT NULL DEFAULT true,
  kind TEXT NOT NULL DEFAULT 'link',
  grid_x INTEGER NOT NULL DEFAULT 0,
  grid_y INTEGER NOT NULL DEFAULT 0,
  col_span INTEGER NOT NULL DEFAULT 1,
  row_span INTEGER NOT NULL DEFAULT 1,
  gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS platform TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS card_size TEXT NOT NULL DEFAULT 'inherit';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'link';
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS grid_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS grid_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS col_span INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS row_span INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.link_in_bio_links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- 5) Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON public.accounts (user_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS platform_connections_user_idx ON public.platform_connections (user_id, platform);
CREATE INDEX IF NOT EXISTS subathons_user_idx ON public.subathons (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS overlays_subathon_idx ON public.overlays (subathon_id);
CREATE INDEX IF NOT EXISTS timer_states_status_idx ON public.timer_states (status);
CREATE INDEX IF NOT EXISTS events_subathon_created_idx ON public.events (subathon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_type_idx ON public.events (subathon_id, event_type);
CREATE INDEX IF NOT EXISTS rules_lookup_idx ON public.rules (subathon_id, event_type, priority DESC);
CREATE INDEX IF NOT EXISTS rules_widget_id_idx ON public.rules (widget_id);
CREATE INDEX IF NOT EXISTS widgets_user_id_idx ON public.widgets (user_id);
CREATE INDEX IF NOT EXISTS widgets_subathon_id_idx ON public.widgets (subathon_id);
CREATE INDEX IF NOT EXISTS widgets_public_token_idx ON public.widgets (public_token);
CREATE INDEX IF NOT EXISTS goals_user_id_idx ON public.goals (user_id);
CREATE INDEX IF NOT EXISTS goals_widget_id_idx ON public.goals (widget_id);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_subathon_idx ON public.audit_logs (subathon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activation_codes_is_used_idx ON public.activation_codes (is_used, created_at DESC);
CREATE INDEX IF NOT EXISTS activation_codes_purchaser_idx ON public.activation_codes (purchaser_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activation_codes_unused_idx
  ON public.activation_codes (is_used, is_active)
  WHERE is_used = false AND is_active = true;
CREATE INDEX IF NOT EXISTS pro_purchases_user_idx ON public.pro_purchases (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pro_purchases_email_idx ON public.pro_purchases (lower(email), created_at DESC);
CREATE INDEX IF NOT EXISTS pro_purchases_type_idx ON public.pro_purchases (purchase_type, created_at DESC);
CREATE INDEX IF NOT EXISTS clips_user_created_idx ON public.clips (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS clips_user_external_idx
  ON public.clips (user_id, platform, external_id) WHERE external_id IS NOT NULL;
DROP INDEX IF EXISTS custom_chat_commands_user_name_idx;
CREATE UNIQUE INDEX custom_chat_commands_user_name_idx
  ON public.custom_chat_commands (user_id, lower(name));
CREATE INDEX IF NOT EXISTS custom_chat_commands_user_enabled_idx
  ON public.custom_chat_commands (user_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS message_timers_user_enabled_idx
  ON public.message_timers (user_id) WHERE enabled;
CREATE INDEX IF NOT EXISTS giveaway_participants_user_idx
  ON public.giveaway_participants (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS giveaway_settings_overlay_token_key
  ON public.giveaway_settings (overlay_token);
CREATE INDEX IF NOT EXISTS media_requests_queue_idx
  ON public.media_requests (user_id, status, position, created_at);
CREATE INDEX IF NOT EXISTS media_requests_video_idx
  ON public.media_requests (user_id, youtube_video_id);
CREATE INDEX IF NOT EXISTS media_requests_platform_idx
  ON public.media_requests (user_id, platform);
CREATE UNIQUE INDEX IF NOT EXISTS media_requests_active_video_unique
  ON public.media_requests (user_id, youtube_video_id)
  WHERE status IN ('PENDING', 'QUEUED', 'PLAYING');
CREATE UNIQUE INDEX IF NOT EXISTS media_request_settings_mod_token_key
  ON public.media_request_settings (mod_token);
CREATE INDEX IF NOT EXISTS stream_marks_user_started_idx
  ON public.stream_marks (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS stream_marks_user_open_idx
  ON public.stream_marks (user_id, started_at DESC) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS mark_point_settings_share_token_idx
  ON public.mark_point_settings (share_token);
CREATE UNIQUE INDEX IF NOT EXISTS mark_point_allowlist_user_name_idx
  ON public.mark_point_allowlist (user_id, lower(username));
CREATE INDEX IF NOT EXISTS stream_schedule_slots_user_idx
  ON public.stream_schedule_slots (user_id, weekday, start_minutes);
CREATE INDEX IF NOT EXISTS stream_schedule_slots_occurs_on_idx
  ON public.stream_schedule_slots (user_id, occurs_on) WHERE occurs_on IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS link_in_bio_profiles_slug_unique
  ON public.link_in_bio_profiles (slug);
CREATE INDEX IF NOT EXISTS link_in_bio_links_user_order_idx
  ON public.link_in_bio_links (user_id, sort_order);

-- -----------------------------------------------------------------------------
-- 6) Foreign keys (idempotent DO blocks)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('users_id_fkey', 'public.users', 'ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE'),
      ('accounts_user_id_fkey', 'public.accounts', 'ALTER TABLE public.accounts ADD CONSTRAINT accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('sessions_user_id_fkey', 'public.sessions', 'ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('platform_connections_user_id_fkey', 'public.platform_connections', 'ALTER TABLE public.platform_connections ADD CONSTRAINT platform_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('subathons_user_id_fkey', 'public.subathons', 'ALTER TABLE public.subathons ADD CONSTRAINT subathons_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('overlays_subathon_id_fkey', 'public.overlays', 'ALTER TABLE public.overlays ADD CONSTRAINT overlays_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('timer_states_subathon_id_fkey', 'public.timer_states', 'ALTER TABLE public.timer_states ADD CONSTRAINT timer_states_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('events_subathon_id_fkey', 'public.events', 'ALTER TABLE public.events ADD CONSTRAINT events_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('widgets_user_id_fkey', 'public.widgets', 'ALTER TABLE public.widgets ADD CONSTRAINT widgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('widgets_subathon_id_fkey', 'public.widgets', 'ALTER TABLE public.widgets ADD CONSTRAINT widgets_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('rules_subathon_id_fkey', 'public.rules', 'ALTER TABLE public.rules ADD CONSTRAINT rules_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('rules_widget_id_fkey', 'public.rules', 'ALTER TABLE public.rules ADD CONSTRAINT rules_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES public.widgets(id) ON DELETE CASCADE'),
      ('goals_widget_id_fkey', 'public.goals', 'ALTER TABLE public.goals ADD CONSTRAINT goals_widget_id_fkey FOREIGN KEY (widget_id) REFERENCES public.widgets(id) ON DELETE CASCADE'),
      ('goals_user_id_fkey', 'public.goals', 'ALTER TABLE public.goals ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('audit_logs_user_id_fkey', 'public.audit_logs', 'ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL'),
      ('audit_logs_subathon_id_fkey', 'public.audit_logs', 'ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_subathon_id_fkey FOREIGN KEY (subathon_id) REFERENCES public.subathons(id) ON DELETE CASCADE'),
      ('user_subscriptions_user_id_fkey', 'public.user_subscriptions', 'ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('activation_codes_used_by_user_id_fkey', 'public.activation_codes', 'ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_used_by_user_id_fkey FOREIGN KEY (used_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL'),
      ('activation_codes_created_by_fkey', 'public.activation_codes', 'ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL'),
      ('activation_codes_purchaser_user_id_fkey', 'public.activation_codes', 'ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_purchaser_user_id_fkey FOREIGN KEY (purchaser_user_id) REFERENCES public.users(id) ON DELETE SET NULL'),
      ('activation_codes_purchase_id_fkey', 'public.activation_codes', 'ALTER TABLE public.activation_codes ADD CONSTRAINT activation_codes_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.pro_purchases(id) ON DELETE SET NULL'),
      ('pro_purchases_user_id_fkey', 'public.pro_purchases', 'ALTER TABLE public.pro_purchases ADD CONSTRAINT pro_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL'),
      ('pro_purchases_activation_code_id_fkey', 'public.pro_purchases', 'ALTER TABLE public.pro_purchases ADD CONSTRAINT pro_purchases_activation_code_id_fkey FOREIGN KEY (activation_code_id) REFERENCES public.activation_codes(id) ON DELETE SET NULL'),
      ('media_request_settings_user_id_fkey', 'public.media_request_settings', 'ALTER TABLE public.media_request_settings ADD CONSTRAINT media_request_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('media_requests_user_id_fkey', 'public.media_requests', 'ALTER TABLE public.media_requests ADD CONSTRAINT media_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('media_playback_state_user_id_fkey', 'public.media_playback_state', 'ALTER TABLE public.media_playback_state ADD CONSTRAINT media_playback_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE'),
      ('media_playback_state_current_request_id_fkey', 'public.media_playback_state', 'ALTER TABLE public.media_playback_state ADD CONSTRAINT media_playback_state_current_request_id_fkey FOREIGN KEY (current_request_id) REFERENCES public.media_requests(id) ON DELETE SET NULL'),
      ('link_in_bio_themes_user_id_fkey', 'public.link_in_bio_themes', 'ALTER TABLE public.link_in_bio_themes ADD CONSTRAINT link_in_bio_themes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.link_in_bio_profiles(user_id) ON DELETE CASCADE'),
      ('link_in_bio_links_user_id_fkey', 'public.link_in_bio_links', 'ALTER TABLE public.link_in_bio_links ADD CONSTRAINT link_in_bio_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.link_in_bio_profiles(user_id) ON DELETE CASCADE')
    ) AS t(conname, rel, ddl)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      WHERE c.conname = r.conname
        AND c.conrelid = r.rel::regclass
    ) THEN
      BEGIN
        EXECUTE r.ddl;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'FK % skipped: %', r.conname, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 7) Grants
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT ALL ON public.users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_connections TO authenticated;
GRANT ALL ON public.platform_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subathons TO authenticated;
GRANT ALL ON public.subathons TO service_role;
GRANT SELECT ON public.overlays TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.overlays TO authenticated;
GRANT ALL ON public.overlays TO service_role;
GRANT SELECT ON public.timer_states TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timer_states TO authenticated;
GRANT ALL ON public.timer_states TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;
GRANT ALL ON public.widgets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT SELECT ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
GRANT SELECT, UPDATE, DELETE ON public.activation_codes TO authenticated;
GRANT ALL ON public.activation_codes TO service_role;
GRANT SELECT ON public.pro_purchases TO authenticated;
GRANT ALL ON public.pro_purchases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clip_command_settings TO authenticated;
GRANT ALL ON public.clip_command_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clips TO authenticated;
GRANT ALL ON public.clips TO service_role;
GRANT ALL ON public.kick_stream_buffers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_chat_command_settings TO authenticated;
GRANT ALL ON public.custom_chat_command_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_chat_commands TO authenticated;
GRANT ALL ON public.custom_chat_commands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.default_chat_commands TO authenticated;
GRANT ALL ON public.default_chat_commands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_timers TO authenticated;
GRANT ALL ON public.message_timers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaway_settings TO authenticated;
GRANT ALL ON public.giveaway_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.giveaway_participants TO authenticated;
GRANT ALL ON public.giveaway_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_request_settings TO authenticated;
GRANT ALL ON public.media_request_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_requests TO authenticated;
GRANT ALL ON public.media_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_playback_state TO authenticated;
GRANT ALL ON public.media_playback_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stream_marks TO authenticated;
GRANT ALL ON public.stream_marks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mark_point_settings TO authenticated;
GRANT ALL ON public.mark_point_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mark_point_allowlist TO authenticated;
GRANT ALL ON public.mark_point_allowlist TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stream_schedule_settings TO authenticated;
GRANT ALL ON public.stream_schedule_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stream_schedule_slots TO authenticated;
GRANT ALL ON public.stream_schedule_slots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_in_bio_profiles TO authenticated;
GRANT ALL ON public.link_in_bio_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_in_bio_themes TO authenticated;
GRANT ALL ON public.link_in_bio_themes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.link_in_bio_links TO authenticated;
GRANT ALL ON public.link_in_bio_links TO service_role;

-- -----------------------------------------------------------------------------
-- 8) Helper ownership / overlay functions (needed by RLS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owns_subathon(_subathon_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subathons s
    WHERE s.id = _subathon_id AND s.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_public_overlay(_subathon_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.overlays o
    WHERE o.subathon_id = _subathon_id AND o.is_public
  );
$$;

-- Alias used by older timer_states policies
CREATE OR REPLACE FUNCTION public.subathon_has_public_overlay(p_subathon_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_public_overlay(p_subathon_id);
$$;

REVOKE ALL ON FUNCTION public.owns_subathon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_subathon(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_public_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_overlay(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.subathon_has_public_overlay(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subathon_has_public_overlay(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 9) RLS enable + policies
-- -----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subathons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timer_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_command_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kick_stream_buffers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_chat_command_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_chat_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_chat_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_timers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giveaway_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_request_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_playback_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_point_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mark_point_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stream_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_in_bio_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_in_bio_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.link_in_bio_links ENABLE ROW LEVEL SECURITY;

-- users
DROP POLICY IF EXISTS "users_own" ON public.users;
CREATE POLICY "users_own" ON public.users
  FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- accounts / sessions / platform_connections / subathons
DROP POLICY IF EXISTS "accounts_own" ON public.accounts;
CREATE POLICY "accounts_own" ON public.accounts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "sessions_own" ON public.sessions;
CREATE POLICY "sessions_own" ON public.sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "platform_connections_own" ON public.platform_connections;
CREATE POLICY "platform_connections_own" ON public.platform_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "subathons_own" ON public.subathons;
CREATE POLICY "subathons_own" ON public.subathons
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- overlays / timer_states / events / rules
DROP POLICY IF EXISTS "overlays_owner" ON public.overlays;
CREATE POLICY "overlays_owner" ON public.overlays
  FOR ALL TO authenticated
  USING (public.owns_subathon(subathon_id)) WITH CHECK (public.owns_subathon(subathon_id));
DROP POLICY IF EXISTS "overlays_public_read" ON public.overlays;
CREATE POLICY "overlays_public_read" ON public.overlays
  FOR SELECT TO anon, authenticated USING (is_public = true);

DROP POLICY IF EXISTS "timer_states_owner" ON public.timer_states;
CREATE POLICY "timer_states_owner" ON public.timer_states
  FOR ALL TO authenticated
  USING (public.owns_subathon(subathon_id)) WITH CHECK (public.owns_subathon(subathon_id));
DROP POLICY IF EXISTS "timer_states_public_read" ON public.timer_states;
DROP POLICY IF EXISTS timer_states_public_read ON public.timer_states;
CREATE POLICY "timer_states_public_read" ON public.timer_states
  FOR SELECT TO anon, authenticated
  USING (public.has_public_overlay(subathon_id));

DROP POLICY IF EXISTS "events_owner" ON public.events;
CREATE POLICY "events_owner" ON public.events
  FOR ALL TO authenticated
  USING (public.owns_subathon(subathon_id)) WITH CHECK (public.owns_subathon(subathon_id));
DROP POLICY IF EXISTS "rules_owner" ON public.rules;
CREATE POLICY "rules_owner" ON public.rules
  FOR ALL TO authenticated
  USING (public.owns_subathon(subathon_id)) WITH CHECK (public.owns_subathon(subathon_id));

-- widgets / goals
DROP POLICY IF EXISTS widgets_owner ON public.widgets;
CREATE POLICY widgets_owner ON public.widgets
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS goals_owner ON public.goals;
CREATE POLICY goals_owner ON public.goals
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- audit / roles / subscriptions / codes / purchases
DROP POLICY IF EXISTS "audit_logs_own_read" ON public.audit_logs;
CREATE POLICY "audit_logs_own_read" ON public.audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_roles_read_own ON public.user_roles;
CREATE POLICY user_roles_read_own ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_subscriptions_read_own ON public.user_subscriptions;
CREATE POLICY user_subscriptions_read_own ON public.user_subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- is_admin defined below; activation policies recreated after function exists
DROP POLICY IF EXISTS activation_codes_admin_read ON public.activation_codes;
DROP POLICY IF EXISTS activation_codes_admin_update ON public.activation_codes;
DROP POLICY IF EXISTS activation_codes_admin_delete ON public.activation_codes;
DROP POLICY IF EXISTS pro_purchases_read_own ON public.pro_purchases;

-- owner-managed feature tables
DROP POLICY IF EXISTS "Owners manage clip command settings" ON public.clip_command_settings;
CREATE POLICY "Owners manage clip command settings" ON public.clip_command_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage their clips" ON public.clips;
CREATE POLICY "Owners manage their clips" ON public.clips
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage custom chat command settings" ON public.custom_chat_command_settings;
CREATE POLICY "Owners manage custom chat command settings" ON public.custom_chat_command_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage custom chat commands" ON public.custom_chat_commands;
CREATE POLICY "Owners manage custom chat commands" ON public.custom_chat_commands
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage default chat commands" ON public.default_chat_commands;
CREATE POLICY "Owners manage default chat commands" ON public.default_chat_commands
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage message timers" ON public.message_timers;
CREATE POLICY "Owners manage message timers" ON public.message_timers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage their giveaway settings" ON public.giveaway_settings;
CREATE POLICY "Owners manage their giveaway settings" ON public.giveaway_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage their giveaway participants" ON public.giveaway_participants;
CREATE POLICY "Owners manage their giveaway participants" ON public.giveaway_participants
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "media_request_settings_owner" ON public.media_request_settings;
CREATE POLICY "media_request_settings_owner" ON public.media_request_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "media_requests_owner" ON public.media_requests;
CREATE POLICY "media_requests_owner" ON public.media_requests
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "media_playback_state_owner" ON public.media_playback_state;
CREATE POLICY "media_playback_state_owner" ON public.media_playback_state
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage stream marks" ON public.stream_marks;
CREATE POLICY "Owners manage stream marks" ON public.stream_marks
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage mark point settings" ON public.mark_point_settings;
CREATE POLICY "Owners manage mark point settings" ON public.mark_point_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage mark point allowlist" ON public.mark_point_allowlist;
CREATE POLICY "Owners manage mark point allowlist" ON public.mark_point_allowlist
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage stream schedule settings" ON public.stream_schedule_settings;
CREATE POLICY "Owners manage stream schedule settings" ON public.stream_schedule_settings
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage stream schedule slots" ON public.stream_schedule_slots;
CREATE POLICY "Owners manage stream schedule slots" ON public.stream_schedule_slots
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage link-in-bio profiles" ON public.link_in_bio_profiles;
CREATE POLICY "Owners manage link-in-bio profiles" ON public.link_in_bio_profiles
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage link-in-bio themes" ON public.link_in_bio_themes;
CREATE POLICY "Owners manage link-in-bio themes" ON public.link_in_bio_themes
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage link-in-bio links" ON public.link_in_bio_links;
CREATE POLICY "Owners manage link-in-bio links" ON public.link_in_bio_links
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 10) updated_at triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS accounts_updated_at ON public.accounts;
CREATE TRIGGER accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS platform_connections_updated_at ON public.platform_connections;
CREATE TRIGGER platform_connections_updated_at BEFORE UPDATE ON public.platform_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS subathons_updated_at ON public.subathons;
CREATE TRIGGER subathons_updated_at BEFORE UPDATE ON public.subathons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS overlays_updated_at ON public.overlays;
CREATE TRIGGER overlays_updated_at BEFORE UPDATE ON public.overlays
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS timer_states_updated_at ON public.timer_states;
CREATE TRIGGER timer_states_updated_at BEFORE UPDATE ON public.timer_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS rules_updated_at ON public.rules;
CREATE TRIGGER rules_updated_at BEFORE UPDATE ON public.rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS widgets_set_updated_at ON public.widgets;
CREATE TRIGGER widgets_set_updated_at BEFORE UPDATE ON public.widgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS goals_set_updated_at ON public.goals;
CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER user_subscriptions_updated_at BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS pro_purchases_updated_at ON public.pro_purchases;
CREATE TRIGGER pro_purchases_updated_at BEFORE UPDATE ON public.pro_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS clip_command_settings_updated_at ON public.clip_command_settings;
CREATE TRIGGER clip_command_settings_updated_at BEFORE UPDATE ON public.clip_command_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS clips_updated_at ON public.clips;
CREATE TRIGGER clips_updated_at BEFORE UPDATE ON public.clips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS custom_chat_command_settings_updated_at ON public.custom_chat_command_settings;
CREATE TRIGGER custom_chat_command_settings_updated_at BEFORE UPDATE ON public.custom_chat_command_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS custom_chat_commands_updated_at ON public.custom_chat_commands;
CREATE TRIGGER custom_chat_commands_updated_at BEFORE UPDATE ON public.custom_chat_commands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS default_chat_commands_updated_at ON public.default_chat_commands;
CREATE TRIGGER default_chat_commands_updated_at BEFORE UPDATE ON public.default_chat_commands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS message_timers_updated_at ON public.message_timers;
CREATE TRIGGER message_timers_updated_at BEFORE UPDATE ON public.message_timers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS media_request_settings_updated_at ON public.media_request_settings;
CREATE TRIGGER media_request_settings_updated_at BEFORE UPDATE ON public.media_request_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS media_requests_updated_at ON public.media_requests;
CREATE TRIGGER media_requests_updated_at BEFORE UPDATE ON public.media_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS media_playback_state_updated_at ON public.media_playback_state;
CREATE TRIGGER media_playback_state_updated_at BEFORE UPDATE ON public.media_playback_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS stream_marks_updated_at ON public.stream_marks;
CREATE TRIGGER stream_marks_updated_at BEFORE UPDATE ON public.stream_marks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS mark_point_settings_updated_at ON public.mark_point_settings;
CREATE TRIGGER mark_point_settings_updated_at BEFORE UPDATE ON public.mark_point_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS stream_schedule_settings_updated_at ON public.stream_schedule_settings;
CREATE TRIGGER stream_schedule_settings_updated_at BEFORE UPDATE ON public.stream_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS stream_schedule_slots_updated_at ON public.stream_schedule_slots;
CREATE TRIGGER stream_schedule_slots_updated_at BEFORE UPDATE ON public.stream_schedule_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS link_in_bio_profiles_updated_at ON public.link_in_bio_profiles;
CREATE TRIGGER link_in_bio_profiles_updated_at BEFORE UPDATE ON public.link_in_bio_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS link_in_bio_themes_updated_at ON public.link_in_bio_themes;
CREATE TRIGGER link_in_bio_themes_updated_at BEFORE UPDATE ON public.link_in_bio_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS link_in_bio_links_updated_at ON public.link_in_bio_links;
CREATE TRIGGER link_in_bio_links_updated_at BEFORE UPDATE ON public.link_in_bio_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 11) Auth sync + role / admin / activation / timer / goal functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, image)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data ->> 'name',
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'preferred_username',
      NEW.raw_user_meta_data ->> 'username'
    ),
    COALESCE(
      NEW.raw_user_meta_data ->> 'avatar_url',
      NEW.raw_user_meta_data ->> 'picture',
      NEW.raw_user_meta_data ->> 'image'
    )
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, public.users.name),
      image = COALESCE(EXCLUDED.image, public.users.image),
      updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _user_id
      AND lower(u.email) IN ('store@creovix.com', 'creovix0@gmail.com')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;

-- Admin policies that depend on is_admin
CREATE POLICY activation_codes_admin_read ON public.activation_codes
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY activation_codes_admin_update ON public.activation_codes
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY activation_codes_admin_delete ON public.activation_codes
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY pro_purchases_read_own ON public.pro_purchases
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Seed hardcoded admin role rows when accounts exist
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN ('store@creovix.com', 'creovix0@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- Backfill public.users from auth.users
INSERT INTO public.users (id, email, name, image)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'preferred_username',
    u.raw_user_meta_data ->> 'username'
  ),
  COALESCE(
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture',
    u.raw_user_meta_data ->> 'image'
  )
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_activation_code(
  p_duration_days integer,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_code text;
  v_days integer := coalesce(p_duration_days, 30);
BEGIN
  IF v_user IS NULL OR NOT public.is_admin(v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_days < 1 OR v_days > 36500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;

  LOOP
    v_code := upper(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/=OIL', 'ABCDEF'));
    v_code := substr(regexp_replace(v_code, '[^A-Z0-9]', '', 'g'), 1, 16);
    EXIT WHEN length(v_code) = 16
      AND NOT EXISTS (SELECT 1 FROM public.activation_codes WHERE code = v_code);
  END LOOP;

  INSERT INTO public.activation_codes (code, duration_days, created_by, notes, source)
  VALUES (v_code, v_days, v_user, nullif(btrim(coalesce(p_notes, '')), ''), 'admin');

  RETURN jsonb_build_object('ok', true, 'code', v_code, 'duration_days', v_days);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_activation_code(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_activation_code(integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.redeem_activation_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_code public.activation_codes;
  v_clean text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_current timestamptz;
  v_current_lifetime boolean := false;
  v_base timestamptz;
  v_new timestamptz;
  v_lifetime boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated', 'error', 'not_authenticated');
  END IF;

  IF length(v_clean) <> 16 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'error', 'invalid_format');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user;

  SELECT * INTO v_code FROM public.activation_codes WHERE code = v_clean FOR UPDATE;

  IF NOT FOUND OR v_code.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'error', 'not_found');
  END IF;

  IF v_code.is_used THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'error', 'already_used');
  END IF;

  IF coalesce(v_code.is_revoked, false) OR NOT coalesce(v_code.is_active, true) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'error', 'deactivated');
  END IF;

  IF v_code.code_expires_at IS NOT NULL AND v_code.code_expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'error', 'code_expired');
  END IF;

  v_lifetime := v_code.duration_days >= 36500;

  SELECT expires_at, is_lifetime INTO v_current, v_current_lifetime
  FROM public.user_subscriptions WHERE user_id = v_user;

  v_base := CASE WHEN v_current IS NOT NULL AND v_current > now() THEN v_current ELSE now() END;

  IF v_lifetime OR coalesce(v_current_lifetime, false) THEN
    v_new := now() + interval '100 years';
    v_lifetime := true;
  ELSE
    v_new := v_base + make_interval(days => v_code.duration_days);
  END IF;

  UPDATE public.activation_codes
     SET is_used = true,
         used_by_user_id = v_user,
         redeemed_at = now(),
         redeemed_by_email = v_email
   WHERE id = v_code.id;

  INSERT INTO public.user_subscriptions (user_id, subscription_status, expires_at, active_code, is_lifetime)
  VALUES (v_user, 'active', v_new, v_clean, v_lifetime)
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_status = 'active',
        expires_at = EXCLUDED.expires_at,
        active_code = EXCLUDED.active_code,
        is_lifetime = EXCLUDED.is_lifetime,
        updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'expires_at', v_new,
    'is_lifetime', v_lifetime,
    'duration_days', v_code.duration_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_activation_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_activation_code(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_activation_code(p_code_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_code public.activation_codes;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin(v_admin) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_code FROM public.activation_codes WHERE id = p_code_id FOR UPDATE;

  IF v_code.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.activation_codes
     SET is_revoked = true, is_active = false, revoked_at = now()
   WHERE id = p_code_id;

  IF v_code.used_by_user_id IS NOT NULL THEN
    UPDATE public.user_subscriptions
       SET subscription_status = 'inactive',
           expires_at = now(),
           is_lifetime = false,
           active_code = NULL,
           updated_at = now()
     WHERE user_id = v_code.used_by_user_id
       AND (active_code = v_code.code OR active_code IS NULL);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_activation_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_activation_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_timer_seconds(p_subathon_id uuid, p_seconds integer)
RETURNS public.timer_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_row public.timer_states;
BEGIN
  SELECT max_duration_seconds INTO v_max FROM public.subathons WHERE id = p_subathon_id;

  UPDATE public.timer_states t
  SET
    remaining_seconds = GREATEST(
      0,
      CASE
        WHEN v_max IS NOT NULL THEN LEAST(t.remaining_seconds + p_seconds, v_max)
        ELSE t.remaining_seconds + p_seconds
      END
    ),
    total_added_seconds = t.total_added_seconds + GREATEST(p_seconds, 0),
    last_tick_at = now(),
    expires_at = CASE
      WHEN t.status = 'RUNNING' THEN now() + make_interval(secs => GREATEST(
        0,
        CASE
          WHEN v_max IS NOT NULL THEN LEAST(t.remaining_seconds + p_seconds, v_max)
          ELSE t.remaining_seconds + p_seconds
        END
      ))
      ELSE t.expires_at
    END
  WHERE t.subathon_id = p_subathon_id
  RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_timer_seconds(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timer_seconds(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_goal_increment(p_widget_id uuid, p_amount numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value numeric;
BEGIN
  UPDATE public.goals
     SET current_value = current_value + p_amount
   WHERE widget_id = p_widget_id
   RETURNING current_value INTO v_value;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_goal_increment(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_goal_increment(uuid, numeric) TO service_role;

-- -----------------------------------------------------------------------------
-- 12) Storage buckets + policies
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clips',
  'clips',
  false,
  52428800,
  ARRAY['video/mp4', 'video/webm', 'video/mp2t', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'link-in-bio',
  'link-in-bio',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'schedule-covers',
  'schedule-covers',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Clips storage policies
DROP POLICY IF EXISTS "Clips: owners can read their own files" ON storage.objects;
DROP POLICY IF EXISTS "Clips: owners can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Clips: owners can update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Clips: owners can delete their own files" ON storage.objects;
CREATE POLICY "Clips: owners can read their own files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Clips: owners can upload their own files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Clips: owners can update their own files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Clips: owners can delete their own files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'clips' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Link-in-bio storage policies
DROP POLICY IF EXISTS "Link in bio: public read" ON storage.objects;
DROP POLICY IF EXISTS "Link in bio: owners upload" ON storage.objects;
DROP POLICY IF EXISTS "Link in bio: owners update" ON storage.objects;
DROP POLICY IF EXISTS "Link in bio: owners delete" ON storage.objects;
CREATE POLICY "Link in bio: public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'link-in-bio');
CREATE POLICY "Link in bio: owners upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'link-in-bio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Link in bio: owners update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'link-in-bio' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'link-in-bio' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Link in bio: owners delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'link-in-bio' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Schedule covers storage policies
DROP POLICY IF EXISTS "Schedule covers: public read" ON storage.objects;
DROP POLICY IF EXISTS "Schedule covers: owners upload" ON storage.objects;
DROP POLICY IF EXISTS "Schedule covers: owners update" ON storage.objects;
DROP POLICY IF EXISTS "Schedule covers: owners delete" ON storage.objects;
CREATE POLICY "Schedule covers: public read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'schedule-covers');
CREATE POLICY "Schedule covers: owners upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'schedule-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Schedule covers: owners update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'schedule-covers' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'schedule-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Schedule covers: owners delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'schedule-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- 12b) Overlay RPCs (service_role only — used by Nitro overlay stream)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.overlay_stream_events(p_subathon uuid, p_limit integer)
RETURNS TABLE (
  id uuid,
  platform public.platform_type,
  event_type text,
  actor_name text,
  amount numeric,
  currency text,
  quantity integer,
  seconds_added integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.platform, e.event_type::text, e.actor_name, e.amount, e.currency,
         e.quantity, e.seconds_added, e.created_at
  FROM public.events e
  WHERE e.subathon_id = p_subathon
  ORDER BY e.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 5), 50));
$$;

CREATE OR REPLACE FUNCTION public.overlay_tiktok_tappers(p_subathon uuid, p_limit integer)
RETURNS TABLE (
  actor_key text,
  actor_name text,
  avatar_url text,
  taps bigint,
  last_tap_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    coalesce(e.actor_platform_id, e.actor_name, 'anonymous') AS actor_key,
    coalesce(max(e.actor_name), 'Anonymous') AS actor_name,
    max(nullif(e.raw_payload->>'avatarUrl', '')) AS avatar_url,
    sum(greatest(coalesce(e.quantity, 1), 1))::bigint AS taps,
    max(e.created_at) AS last_tap_at
  FROM public.events e
  WHERE e.subathon_id = p_subathon
    AND e.platform = 'TIKTOK'
    AND e.event_type = 'LIKE'
  GROUP BY 1
  ORDER BY taps DESC, last_tap_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 5), 25));
$$;

CREATE OR REPLACE FUNCTION public.overlay_tiktok_tap_total(p_subathon uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(greatest(coalesce(e.quantity, 1), 1)), 0)::bigint
  FROM public.events e
  WHERE e.subathon_id = p_subathon
    AND e.platform = 'TIKTOK'
    AND e.event_type = 'LIKE';
$$;

REVOKE ALL ON FUNCTION public.overlay_stream_events(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overlay_stream_events(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.overlay_tiktok_tappers(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overlay_tiktok_tappers(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.overlay_tiktok_tap_total(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.overlay_tiktok_tap_total(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 13) Reload PostgREST schema cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
