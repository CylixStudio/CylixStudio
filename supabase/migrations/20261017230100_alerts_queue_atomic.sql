-- All queue mutations serialize on a single owner row; never process memory.
create function public.alerts_enqueue(p_owner uuid, p_key text, p_event jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.alerts_queue;
begin
  insert into alerts_queue_state(owner_id) values(p_owner) on conflict do nothing;
  perform 1 from alerts_queue_state where owner_id=p_owner for update;
  select * into e from alerts_queue where owner_id=p_owner and event_key=p_key;
  if found then return jsonb_build_object('event',e.payload,'queued',false,'duplicate',true); end if;
  if (select count(*) from alerts_queue where owner_id=p_owner and status in ('pending','claimed')) >= 100
    then raise exception 'alerts_queue_full'; end if;
  insert into alerts_queue(id,owner_id,event_key,payload)
    values((p_event->>'id')::uuid,p_owner,p_key,p_event) returning * into e;
  return jsonb_build_object('event',e.payload,'queued',true,'duplicate',false);
end $$;
create function public.alerts_claim(p_owner uuid, p_overlay uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.alerts_queue_state; e public.alerts_queue; receipt uuid;
begin
  insert into alerts_queue_state(owner_id) values(p_owner) on conflict do nothing;
  select * into s from alerts_queue_state where owner_id=p_owner for update;
  if s.active_overlay_id is not null and s.active_overlay_id <> p_overlay and s.active_lease_until > clock_timestamp() then
    return jsonb_build_object('status','standby');
  end if;
  update alerts_queue_state set active_overlay_id=p_overlay,active_lease_until=clock_timestamp()+interval '15 seconds' where owner_id=p_owner;
  if s.current_id is not null then
    select * into e from alerts_queue where id=s.current_id and owner_id=p_owner;
    if e.status='claimed' and e.lease_until > clock_timestamp() then
      return jsonb_build_object('status','busy');
    end if;
    -- Expired displays are not replayed: prevents double gifts after a lost ACK.
    update alerts_queue set status='skipped' where id=s.current_id and owner_id=p_owner and status='claimed';
    update alerts_queue_state set current_id=null where owner_id=p_owner;
  end if;
  if s.paused then return jsonb_build_object('status','paused'); end if;
  select * into e from alerts_queue where owner_id=p_owner and status='pending'
    order by created_at,id for update skip locked limit 1;
  if not found then return jsonb_build_object('status','empty'); end if;
  receipt := gen_random_uuid();
  update alerts_queue set status='claimed', overlay_id=p_overlay, claim_id=receipt,
    lease_until=clock_timestamp()+make_interval(secs=>least(70,greatest(31,
      coalesce((e.payload->'config'->>'durationMs')::int,6000)/1000.0 +
      coalesce((e.payload->'config'->>'delayMs')::int,0)/1000.0 + 30)))
    where id=e.id;
  update alerts_queue_state set current_id=e.id where owner_id=p_owner;
  return jsonb_build_object('status','granted','event',e.payload,'claimId',receipt);
end $$;
create function public.alerts_presence(p_owner uuid,p_overlay uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.alerts_queue_state;
begin
  insert into alerts_queue_state(owner_id) values(p_owner) on conflict do nothing;
  select * into s from alerts_queue_state where owner_id=p_owner for update;
  if s.active_overlay_id is not null and s.active_overlay_id<>p_overlay and s.active_lease_until>clock_timestamp() then return false; end if;
  update alerts_queue_state set active_overlay_id=p_overlay,active_lease_until=clock_timestamp()+interval '15 seconds' where owner_id=p_owner;
  return true;
end $$;
create function public.alerts_ack(p_owner uuid,p_event uuid,p_overlay uuid,p_claim uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from alerts_queue_state where owner_id=p_owner for update;
  update alerts_queue set status='done' where owner_id=p_owner and id=p_event
    and status='claimed' and overlay_id=p_overlay and claim_id=p_claim;
  if not found then return false; end if;
  update alerts_queue_state set current_id=null where owner_id=p_owner and current_id=p_event;
  return true;
end $$;
create function public.alerts_control(p_owner uuid,p_action text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare current_event uuid;
begin
  insert into alerts_queue_state(owner_id) values(p_owner) on conflict do nothing;
  select current_id into current_event from alerts_queue_state where owner_id=p_owner for update;
  if p_action in ('pause','resume') then
    update alerts_queue_state set paused=(p_action='pause') where owner_id=p_owner;
  elsif p_action='skip' then
    update alerts_queue set status='skipped' where owner_id=p_owner and id=current_event;
    update alerts_queue_state set current_id=null where owner_id=p_owner;
  elsif p_action='clear' then
    update alerts_queue set status='skipped' where owner_id=p_owner and status='pending';
  else raise exception 'invalid_action'; end if;
end $$;
revoke all on function public.alerts_enqueue(uuid,text,jsonb), public.alerts_claim(uuid,uuid),
  public.alerts_ack(uuid,uuid,uuid,uuid), public.alerts_control(uuid,text), public.alerts_presence(uuid,uuid) from public,anon,authenticated;
grant execute on function public.alerts_enqueue(uuid,text,jsonb), public.alerts_claim(uuid,uuid),
  public.alerts_ack(uuid,uuid,uuid,uuid), public.alerts_control(uuid,text), public.alerts_presence(uuid,uuid) to service_role;
