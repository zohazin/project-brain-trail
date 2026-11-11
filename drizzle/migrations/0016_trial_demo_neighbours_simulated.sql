-- Trial mode: a trial borrower's requests to demo neighbours are answered by simulated (AI) lenders, since no person
-- watches those demo accounts for a practice account. Marked by the database only; the normal booking rules still run.
create or replace function public.requests_mark_simulated()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.simulated := coalesce((select p.is_simulated from public.profiles p where p.id = new.owner_id), false)
      or exists (
        select 1 from public.profiles b, public.profiles o
        where b.id = new.borrower_id and o.id = new.owner_id
          and b.trial_of is not null and b.is_demo and o.is_demo and o.trial_of is null
      );
  else
    new.simulated := old.simulated;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.sim_owner_act(_req uuid, _presenter uuid, _action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.requests; o public.profiles; b public.profiles; bp public.meeting_prefs;
  f timestamptz; t timestamptz;
begin
  select * into r from public.requests where id = _req;
  if r.id is null then raise exception 'This booking was not found.'; end if;
  if r.borrower_id is distinct from _presenter then
    raise exception 'Only the borrower on this demo booking can use the demo actions.';
  end if;
  select * into o from public.profiles where id = r.owner_id;
  select * into b from public.profiles where id = r.borrower_id;
  if not coalesce(r.simulated, false) or not coalesce(o.is_demo, false) or not coalesce(b.is_demo, false) then
    raise exception 'Demo actions work only with simulated demo owners.';
  end if;

  perform set_config('request.jwt.claim.sub', r.owner_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', r.owner_id, 'role', 'authenticated')::text, true);

  if _action = 'accept' then
    perform public.respond_request(_req, true, r.terms_version);
  elsif _action = 'decline' then
    perform public.respond_request(_req, false);
  elsif _action = 'pickup' then
    if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
    if coalesce(r.borrower_picked_qty, 0) <= coalesce(r.picked_up_qty, 0) then
      raise exception 'First tap "I collected" as the borrower, then confirm the pickup here.';
    end if;
    perform public.confirm_handover(_req, r.borrower_picked_qty, null, false);
  elsif _action = 'return' then
    if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
    if coalesce(r.borrower_returned_qty, 0) <= coalesce(r.returned_qty, 0) then
      raise exception 'First record the return as the borrower, then confirm it here.';
    end if;
    perform public.confirm_handover(_req, r.picked_up_qty, r.borrower_returned_qty, false);
  elsif _action = 'meet' then
    if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
    select * into bp from public.meeting_prefs where request_id = _req and user_id = r.borrower_id;
    f := coalesce(bp.free_from, r.pickup_at - interval '30 minutes');
    t := coalesce(bp.free_to, r.pickup_at + interval '1 hour');
    if t <= f then t := f + interval '1 hour'; end if;
    insert into public.meeting_prefs (request_id, user_id, free_from, free_to, place, updated_at)
    values (_req, r.owner_id, f, t, 'A public place (market, mosque or park gate)', now())
    on conflict (request_id, user_id) do update
      set free_from = excluded.free_from, free_to = excluded.free_to, place = excluded.place, updated_at = now();
  else
    raise exception 'Unknown demo action.';
  end if;

  select * into r from public.requests where id = _req;
  return jsonb_build_object('status', r.status, 'want_id', r.want_id, 'picked_up_qty', r.picked_up_qty, 'returned_qty', r.returned_qty);
end $function$;

revoke all on function public.sim_owner_act(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.sim_owner_act(uuid, uuid, text) to service_role;

-- Backfill: trial requests sent before this change.
alter table public.requests disable trigger requests_mark_simulated;
update public.requests r set simulated = true
  from public.profiles b, public.profiles o
  where b.id = r.borrower_id and o.id = r.owner_id and b.trial_of is not null and b.is_demo and o.is_demo and o.trial_of is null and not r.simulated;
alter table public.requests enable trigger requests_mark_simulated;