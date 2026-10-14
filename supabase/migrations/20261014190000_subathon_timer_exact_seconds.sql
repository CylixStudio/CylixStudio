-- NOT APPLIED. Waiting for approval. Do not run this against production from the app.
--
-- apply_timer_seconds used to set expires_at = now() + remaining_seconds while
-- RUNNING. remaining_seconds is the bank captured at started_at, so that
-- rewrite moved the deadline forward by the time already elapsed.
-- The client treats endAt as started_at + remaining_seconds and ignores
-- expires_at while running, so the live countdown does not depend on this
-- function. The function is still wrong for any reader of expires_at, and a
-- paused hold stores its fractional millisecond in expires_at - paused_at.
--
-- Idempotency does not need a new column. events_provider_dedup on
-- (platform, provider_event_id) already rejects a second delivery before
-- this function runs.

CREATE OR REPLACE FUNCTION public.apply_timer_seconds(p_subathon_id uuid, p_seconds integer)
RETURNS public.timer_states
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_row public.timer_states;
  v_next integer;
  v_held numeric;
BEGIN
  SELECT max_duration_seconds INTO v_max FROM public.subathons WHERE id = p_subathon_id;

  SELECT * INTO v_row
    FROM public.timer_states
   WHERE subathon_id = p_subathon_id
   FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_row.status = 'PAUSED' AND v_row.paused_at IS NOT NULL AND v_row.expires_at IS NOT NULL THEN
    v_held := EXTRACT(EPOCH FROM (v_row.expires_at - v_row.paused_at)) + p_seconds;
    IF v_held < 0 THEN
      v_held := 0;
    END IF;
    IF v_max IS NOT NULL AND v_held > GREATEST(v_max, 0) THEN
      v_held := GREATEST(v_max, 0);
    END IF;
    v_next := FLOOR(v_held)::integer;
  ELSE
    v_next := GREATEST(0, v_row.remaining_seconds + p_seconds);
    IF v_max IS NOT NULL THEN
      v_next := LEAST(v_next, GREATEST(v_max, 0));
    END IF;
    v_held := v_next;
  END IF;

  UPDATE public.timer_states t
     SET remaining_seconds = CASE
           WHEN t.status = 'PAUSED' AND t.paused_at IS NOT NULL AND t.expires_at IS NOT NULL THEN v_next
           ELSE v_next
         END,
         total_added_seconds = t.total_added_seconds + GREATEST(p_seconds, 0),
         last_tick_at = now(),
         expires_at = CASE
           WHEN t.status = 'RUNNING' AND t.started_at IS NOT NULL THEN
             t.started_at + make_interval(secs => v_next)
           WHEN t.status = 'PAUSED' AND t.paused_at IS NOT NULL AND t.expires_at IS NOT NULL THEN
             t.paused_at + make_interval(secs => v_held::double precision)
           ELSE t.expires_at
         END
   WHERE t.id = v_row.id
   RETURNING t.* INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_timer_seconds(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_timer_seconds(uuid, integer) TO service_role;
