create index alerts_queue_pending_owner on public.alerts_queue(owner_id,created_at,id) where status='pending';
create unique index alerts_queue_claimed_owner on public.alerts_queue(owner_id) where status='claimed';
create index alerts_media_owner on public.alerts_media(owner_id);
alter table public.alerts_studios add constraint alerts_token_shape check(overlay_token ~ '^alerts-[a-f0-9]{64}$' and overlay_token_hash ~ '^[a-f0-9]{64}$');
alter table public.alerts_media add constraint alerts_media_owner_path check(path like owner_id::text || '/%' and path !~ '\.\.');
alter table public.alerts_media add constraint alerts_media_kind check(alert_id in ('follow','subscription','resubscription','gift','raid','kicks','cheer'));
alter table public.alerts_queue add constraint alerts_event_object check(jsonb_typeof(payload)='object' and length(event_key) between 1 and 200);
