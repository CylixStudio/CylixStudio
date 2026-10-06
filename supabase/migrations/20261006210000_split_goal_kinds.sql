-- Allow the four standalone goal widget kinds.
-- Existing GOAL_BAR rows stay in place.
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'DONATION_GOAL';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'FOLLOWER_GOAL';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'SUBSCRIBER_GOAL';
ALTER TYPE public.widget_type ADD VALUE IF NOT EXISTS 'CUSTOM_GOAL';
