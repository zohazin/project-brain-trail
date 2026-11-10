-- Must-have features a borrower asked for (e.g. "HDMI input")
alter table public.wants add column if not exists requirements text[] not null default '{}';

-- What was agreed when the request was sent (kept even if the owner edits the listing later)
alter table public.requests add column if not exists agreed jsonb;

-- ---------- blocks ----------
create table if not exists public.blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  label text not null default '',
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
grant select, delete on public.blocks to authenticated;
grant all on public.blocks to service_role;
alter table public.blocks enable row level security;
create policy "Read own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "Remove own blocks" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

create or replace function public.is_blocked(_a uuid, _b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks
    where (blocker_id = _a and blocked_id = _b) or (blocker_id = _b and blocked_id = _a))
$$;
revoke execute on function public.is_blocked(uuid, uuid) from anon, public;
grant execute on function public.is_blocked(uuid, uuid) to authenticated, service_role;

create or replace function public.block_from_request(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; other uuid; lbl text; iam_owner boolean;
begin
  select * into r from public.requests where id = _req;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  iam_owner := r.owner_id = auth.uid();
  other := case when iam_owner then r.borrower_id else r.owner_id end;
  lbl := case
    when r.status in ('confirmed','completed') then coalesce(case when iam_owner then r.borrower_name else r.owner_name end, 'Someone')
    when iam_owner then 'Someone who asked for ' || lower(r.item_name)
    else r.owner_name || ' (' || lower(r.item_name) || ')' end;
  insert into public.blocks (blocker_id, blocked_id, label) values (auth.uid(), other, left(lbl, 120))
  on conflict do nothing;
  update public.requests
    set status = case when owner_id = auth.uid() then 'declined' else 'cancelled' end, decided_at = now(), updated_at = now()
  where status = 'requested'
    and ((owner_id = auth.uid() and borrower_id = other) or (borrower_id = auth.uid() and owner_id = other));
end $$;
revoke execute on function public.block_from_request(uuid) from anon, public;
grant execute on function public.block_from_request(uuid) to authenticated;

-- ---------- each person's own address per booking ----------
create table if not exists public.party_addresses (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  home_pickup boolean not null default false,
  address text not null default '' check (char_length(address) <= 300),
  shared boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
grant select, insert, update on public.party_addresses to authenticated;
grant all on public.party_addresses to service_role;
alter table public.party_addresses enable row level security;
create policy "Own or shared address read" on public.party_addresses for select to authenticated
  using (user_id = auth.uid() or (shared and public.is_party(request_id)));
create policy "Own address insert" on public.party_addresses for insert to authenticated
  with check (user_id = auth.uid() and public.chat_open(request_id));
create policy "Own address update" on public.party_addresses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_party(request_id));

insert into public.party_addresses (request_id, user_id, home_pickup, address, shared, updated_at)
select request_id, owner_id, home_pickup, address, shared, updated_at from public.request_addresses
on conflict do nothing;
comment on table public.request_addresses is 'DEPRECATED: replaced by party_addresses (each person shares their own address)';

-- ---------- matching: server only, no owner names, respects blocks ----------
drop function if exists public.match_items(uuid, numeric);
create function public.match_items(_want uuid, _km numeric)
returns table(item_id uuid, item_name text, photo_path text, kind text, unit text,
  price_rs numeric, price_per numeric, distance_km numeric, owner_limit_km numeric, allow_outside boolean,
  free_qty numeric, time_note text, avg_rating numeric, rating_count int, text_score real,
  ai_summary text, needs_summary boolean, area_name text, specs text, description text)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare w public.wants;
begin
  select * into w from public.wants where id = _want;
  if w.id is null then raise exception 'Not found'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from w.borrower_id then
    raise exception 'Not allowed';
  end if;
  return query
  select i.id, i.name, i.photo_path, i.kind, i.unit, i.price_rs, i.price_per,
    round(public.km_between(w.lat, w.lng, i.lat, i.lng)::numeric, 1),
    i.max_distance_km, i.allow_outside,
    public.item_free_qty(i.id, w.pickup_at, w.return_at),
    public.item_time_check(i, w.pickup_at, w.return_at),
    rt.avg_r, rt.cnt,
    greatest(similarity(lower(i.name), lower(coalesce(w.item_name, ''))),
             case when i.ai_keywords && w.ai_keywords then 1 else 0 end)::real,
    i.ai_summary, (i.ai_summary is null or i.summary_stale), i.area_name, i.specs, i.description
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> w.borrower_id and not p.restricted
    and not public.is_blocked(i.owner_id, w.borrower_id)
    and public.km_between(w.lat, w.lng, i.lat, i.lng) <= _km
    and (
      i.ai_keywords && w.ai_keywords
      or similarity(lower(i.name), lower(coalesce(w.item_name, ''))) > 0.25
      or (coalesce(w.item_name, '') <> '' and lower(i.name) like '%' || lower(w.item_name) || '%')
    )
  order by 8;
end $$;
revoke execute on function public.match_items(uuid, numeric) from anon, public, authenticated;
grant execute on function public.match_items(uuid, numeric) to service_role;

-- ---------- Find screen list: no owner names; inside both distance limits ----------
drop function if exists public.nearby_items(numeric);
create function public.nearby_items(_km numeric)
returns table(item_id uuid, item_name text, photo_path text, kind text, unit text,
  free_qty numeric, price_rs numeric, price_per numeric, distance_km numeric, avg_rating numeric, rating_count int, area_name text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not allowed'; end if;
  return query
  select i.id, i.name, i.photo_path, i.kind, i.unit,
    public.item_free_qty(i.id, now(), now() + interval '1 hour'),
    i.price_rs, i.price_per,
    round(public.km_between(me.lat, me.lng, i.lat, i.lng)::numeric, 1),
    rt.avg_r, rt.cnt, i.area_name
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> me.id and not p.restricted
    and not public.is_blocked(i.owner_id, me.id)
    and public.km_between(me.lat, me.lng, i.lat, i.lng) <= least(_km, i.max_distance_km)
  order by 9
  limit 60;
end $$;
revoke execute on function public.nearby_items(numeric) from anon, public;
grant execute on function public.nearby_items(numeric) to authenticated;

-- ---------- sending requests: anonymous labels, agreed details, blocks, no repeats ----------
create or replace function public.send_requests(_want uuid, _allocs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.wants; a jsonb; it public.items; q numeric; n int := 0; dist numeric;
  exc boolean; note_txt text; tn text; already numeric; me public.profiles; idx int; lbl text;
begin
  select * into w from public.wants where id = _want for update;
  if w.id is null or w.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  select * into me from public.profiles where id = auth.uid();
  if me.restricted then raise exception 'Your account is paused after a review. Please contact your area admin.'; end if;
  if w.pickup_at is null or w.quantity is null then raise exception 'Some details are missing.'; end if;
  if w.kind = 'return' and w.return_at is null then raise exception 'Please tell us when you will bring it back.'; end if;
  if w.pickup_at < now() - interval '15 minutes' then raise exception 'The pickup time has passed. Please choose a new time.'; end if;

  for a in select * from jsonb_array_elements(_allocs) loop
    select * into it from public.items where id = (a->>'item_id')::uuid for update;
    if it.id is null or it.status <> 'active' or it.owner_id = w.borrower_id then
      raise exception 'This item is no longer available.';
    end if;
    if exists (select 1 from public.requests where want_id = _want and item_id = it.id and status in ('requested','confirmed')) then
      continue; -- already sent (double tap / retry)
    end if;
    if public.is_blocked(it.owner_id, w.borrower_id) then raise exception 'This item is not available to you.'; end if;
    if exists (select 1 from public.requests where borrower_id = w.borrower_id and item_id = it.id and status = 'requested') then
      raise exception 'You already have a request waiting for this %.', lower(it.name);
    end if;
    q := (a->>'quantity')::numeric;
    if q is null or q <= 0 then raise exception 'Please choose how many you need.'; end if;
    select coalesce(sum(quantity), 0) into already from public.requests where want_id = _want and status in ('requested','confirmed','completed');
    if already + q > w.quantity then raise exception 'That is more than you asked for.'; end if;
    exc := coalesce((a->>'is_exception')::boolean, false);
    if exc and exists (select 1 from public.requests where borrower_id = w.borrower_id and item_id = it.id
        and is_exception and status = 'declined' and decided_at > now() - interval '30 days') then
      raise exception 'This owner already said no to an exception for this item.';
    end if;
    dist := public.km_between(w.lat, w.lng, it.lat, it.lng);
    if dist > w.search_km + 0.05 then raise exception '% is farther than you said you can go.', it.name; end if;
    if dist > it.max_distance_km and not (exc and it.allow_outside) then
      raise exception '% is outside the owner''s area.', it.name;
    end if;
    tn := public.item_time_check(it, w.pickup_at, w.return_at);
    if tn is not null then raise exception '%: %', it.name, tn; end if;
    if public.item_free_qty(it.id, w.pickup_at, w.return_at) < q then
      raise exception 'Only % left for %.', public.item_free_qty(it.id, w.pickup_at, w.return_at), it.name;
    end if;
    note_txt := null;
    if exc then
      note_txt := left(regexp_replace(regexp_replace(coalesce(a->>'note', ''),
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[hidden]', 'g'),
        '\+?[0-9][0-9 -]{6,}[0-9]', '[hidden]', 'g'), 300);
    end if;
    select count(*) into idx from public.requests where want_id = _want;
    lbl := 'Owner ' || chr(65 + (idx % 26));
    insert into public.requests (want_id, item_id, borrower_id, owner_id, item_name, item_photo, unit, owner_name,
      borrower_name, kind, quantity, total_rs, pickup_at, return_at, is_exception, note, agreed)
    values (_want, it.id, w.borrower_id, it.owner_id, it.name, it.photo_path, it.unit, lbl,
      null, it.kind, q,
      case when it.kind = 'use_up' then round(it.price_rs * q / it.price_per) else it.price_rs * q end,
      w.pickup_at, case when it.kind = 'return' then w.return_at else null end, exc, note_txt,
      jsonb_build_object('description', it.description, 'specs', it.specs, 'price_rs', it.price_rs,
        'price_per', it.price_per, 'unit', it.unit, 'kind', it.kind, 'area_name', it.area_name));
    n := n + 1;
  end loop;

  update public.wants set status = 'active', pending_plan = null, updated_at = now() where id = _want;
  return n;
end $$;
revoke execute on function public.send_requests(uuid, jsonb) from anon, public;
grant execute on function public.send_requests(uuid, jsonb) to authenticated;

-- ---------- owner answers: names are shared only after yes ----------
create or replace function public.respond_request(_req uuid, _accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; bname text; oname text;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'requested' then return r.want_id; end if; -- already answered (double tap / retry)
  if _accept then
    if public.is_blocked(r.owner_id, r.borrower_id) then raise exception 'You can''t lend to this person.'; end if;
    perform 1 from public.items where id = r.item_id for update;
    if public.item_free_qty(r.item_id, r.pickup_at, r.return_at) < r.quantity then
      raise exception 'You no longer have enough free for these times.';
    end if;
    select split_part(display_name, ' ', 1) into bname from public.profiles where id = r.borrower_id;
    select split_part(display_name, ' ', 1) into oname from public.profiles where id = r.owner_id;
    update public.requests set status = 'confirmed', decided_at = now(), updated_at = now(),
      borrower_name = bname, owner_name = coalesce(nullif(oname, ''), r.owner_name) where id = _req;
    insert into public.messages (request_id, sender_id, body)
      values (_req, null, 'Request confirmed. Tell each other when you are free and where you would like to meet.');
  else
    update public.requests set status = 'declined', decided_at = now(), updated_at = now() where id = _req;
  end if;
  return r.want_id;
end $$;
revoke execute on function public.respond_request(uuid, boolean) from anon, public;
grant execute on function public.respond_request(uuid, boolean) to authenticated;

-- ---------- demo: a projector without HDMI (for the "must have" check) ----------
insert into public.items (id, owner_id, name, description, specs, kind, quantity, unit, price_rs, price_per,
  avail_start, avail_end, area_name, lat, lng, max_distance_km, allow_outside, is_demo)
values
  ('e0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000004', 'Projector',
   'Older projector for presentations. Works with a VGA cable only.', 'VGA input only, no HDMI, 2000 lumens', 'return', 1, 'item', 0, 1,
   '08:00', '21:00', 'Officers Colony', 30.2244, 71.4750, 5, false, true)
on conflict (id) do nothing;