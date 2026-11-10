-- AI demo results: fictional owners and listings created live by AI for demo accounts only.

-- People: simulated demo owners and the per-person on/off setting.
alter table public.profiles add column if not exists is_simulated boolean not null default false;
alter table public.profiles add column if not exists ai_demo_results boolean not null default true;
grant update (ai_demo_results) on public.profiles to authenticated;

-- Listings: which ones were created by AI for a demo search.
alter table public.items add column if not exists is_generated boolean not null default false;
alter table public.items add column if not exists generation_id uuid;
alter table public.items add column if not exists why_it_matches text not null default '';
create index if not exists items_generation_idx on public.items(generation_id) where generation_id is not null;

-- Requests: marked when the owner is a simulated demo owner (set by the database only).
alter table public.requests add column if not exists simulated boolean not null default false;

create or replace function public.items_keep_flags()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo := false;
      new.is_generated := false;
      new.generation_id := null;
      new.why_it_matches := '';
    else
      new.is_demo := old.is_demo;
      new.owner_id := old.owner_id;
      new.is_generated := old.is_generated;
      new.generation_id := old.generation_id;
      new.why_it_matches := old.why_it_matches;
    end if;
  end if;
  return new;
end $function$;

create or replace function public.requests_mark_simulated()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.simulated := coalesce((select p.is_simulated from public.profiles p where p.id = new.owner_id), false);
  else
    new.simulated := old.simulated;
  end if;
  return new;
end $function$;

drop trigger if exists requests_mark_simulated on public.requests;
create trigger requests_mark_simulated before insert or update on public.requests
  for each row execute function public.requests_mark_simulated();

-- One row per AI generation attempt; the unique key stops duplicate generations for the same search version.
create table public.demo_generations (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references public.wants(id) on delete cascade,
  borrower_id uuid not null,
  version_key text not null,
  round int not null default 1,
  status text not null default 'running' check (status in ('running', 'ready', 'failed', 'replaced')),
  missing numeric not null,
  item_ids uuid[] not null default '{}',
  owner_ids uuid[] not null default '{}',
  proposal jsonb,
  model text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (want_id, version_key, round)
);
create index demo_generations_borrower_idx on public.demo_generations(borrower_id, created_at desc);
grant select on public.demo_generations to authenticated;
grant all on public.demo_generations to service_role;
alter table public.demo_generations enable row level security;
create policy "Borrowers read their own sample plans" on public.demo_generations
  for select to authenticated using (borrower_id = auth.uid());

-- Which of these listings were created by AI (a safe yes/no, no owner details).
create or replace function public.generated_item_ids(_ids uuid[])
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select i.id from public.items i where i.id = any(_ids) and i.is_generated
$function$;
revoke all on function public.generated_item_ids(uuid[]) from public, anon;
grant execute on function public.generated_item_ids(uuid[]) to authenticated, service_role;

-- A simulated owner's answer, pickup/return confirmation or meeting time, run through the normal booking functions
-- as that owner, so every existing rule, lock and check still applies. Server only.
create or replace function public.sim_owner_act(_req uuid, _presenter uuid, _action text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if not coalesce(o.is_simulated, false) or not coalesce(o.is_demo, false) or not coalesce(b.is_demo, false) then
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