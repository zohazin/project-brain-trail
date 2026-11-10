create extension if not exists pg_trgm with schema extensions;

-- ---------- roles ----------
create type public.app_role as enum ('area_admin');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  test_cnic text,
  city text not null default 'Multan',
  area_name text,
  lat double precision,
  lng double precision,
  travel_km numeric not null default 3 check (travel_km > 0 and travel_km <= 100),
  onboarded boolean not null default false,
  is_demo boolean not null default false,
  restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, test_cnic, area_name, lat, lng, travel_km, onboarded, updated_at) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "Update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  area text not null default 'Multan',
  unique (user_id, role, area)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "Read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_area_role(_user_id uuid, _role public.app_role, _area text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role and area = _area)
$$;

-- ---------- helpers ----------
create or replace function public.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lat2 is null then 99999 else
    6371 * 2 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))) end
$$;

-- ---------- items ----------
create table public.items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  specs text not null default '' check (char_length(specs) <= 1000),
  photo_path text,
  kind text not null default 'return' check (kind in ('return','use_up')),
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default 'item',
  price_rs numeric not null default 0 check (price_rs >= 0),
  price_per numeric not null default 1 check (price_per > 0),
  avail_days int[] not null default '{0,1,2,3,4,5,6}',
  avail_start time not null default '08:00',
  avail_end time not null default '20:00',
  city text not null default 'Multan',
  area_name text not null default '',
  lat double precision not null,
  lng double precision not null,
  max_distance_km numeric not null default 3 check (max_distance_km > 0),
  allow_outside boolean not null default false,
  status text not null default 'active' check (status in ('active','paused')),
  ai_summary text,
  ai_keywords text[] not null default '{}',
  summary_stale boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.items to authenticated;
grant all on public.items to service_role;
alter table public.items enable row level security;
create policy "Owners read own items" on public.items for select to authenticated using (owner_id = auth.uid());
create policy "Owners add items" on public.items for insert to authenticated
  with check (owner_id = auth.uid() and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.restricted));
create policy "Owners edit items" on public.items for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "Owners delete items" on public.items for delete to authenticated using (owner_id = auth.uid());

create or replace function public.items_mark_stale()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.name, new.description, new.specs, new.kind, new.unit)
     is distinct from (old.name, old.description, old.specs, old.kind, old.unit)
     and new.ai_summary is not distinct from old.ai_summary then
    new.summary_stale := true;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger items_mark_stale before update on public.items for each row execute function public.items_mark_stale();

-- ---------- wants ----------
create table public.wants (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null default auth.uid(),
  conversation jsonb not null default '[]',
  original_text text not null default '',
  photo_path text,
  item_name text,
  kind text not null default 'return' check (kind in ('return','use_up')),
  quantity numeric,
  unit text not null default 'item',
  details text,
  purpose text,
  budget_rs numeric,
  pickup_at timestamptz,
  return_at timestamptz,
  ai_summary text,
  ai_keywords text[] not null default '{}',
  next_question text,
  search_km numeric not null default 3 check (search_km > 0 and search_km <= 100),
  lat double precision,
  lng double precision,
  area_name text,
  status text not null default 'asking' check (status in ('asking','ready','active','done','cancelled')),
  pending_plan jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.wants to authenticated;
grant all on public.wants to service_role;
alter table public.wants enable row level security;
create policy "Borrowers manage own wants" on public.wants for all to authenticated
  using (borrower_id = auth.uid()) with check (borrower_id = auth.uid());

-- ---------- requests (one per owner/item in a plan) ----------
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  want_id uuid not null references public.wants(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  borrower_id uuid not null,
  owner_id uuid not null,
  item_name text not null,
  item_photo text,
  unit text not null default 'item',
  owner_name text not null default '',
  borrower_name text,
  kind text not null,
  quantity numeric not null check (quantity > 0),
  total_rs numeric not null default 0,
  pickup_at timestamptz not null,
  return_at timestamptz,
  status text not null default 'requested' check (status in ('requested','confirmed','declined','cancelled','completed')),
  is_exception boolean not null default false,
  note text,
  picked_up_qty numeric not null default 0,
  returned_qty numeric not null default 0,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index requests_one_active_per_item on public.requests(want_id, item_id) where status in ('requested','confirmed');
create index requests_item_idx on public.requests(item_id, status);
grant select on public.requests to authenticated;
grant all on public.requests to service_role;
alter table public.requests enable row level security;
create policy "Parties read requests" on public.requests for select to authenticated
  using (borrower_id = auth.uid() or owner_id = auth.uid());

create or replace function public.is_party(_req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.requests r where r.id = _req and (r.borrower_id = auth.uid() or r.owner_id = auth.uid()))
$$;
create or replace function public.chat_open(_req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.requests r where r.id = _req and r.status in ('confirmed','completed')
    and (r.borrower_id = auth.uid() or r.owner_id = auth.uid()))
$$;

-- ---------- chat & meeting ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  sender_id uuid,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_req_idx on public.messages(request_id, created_at);
grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;
alter table public.messages enable row level security;
create policy "Parties read messages" on public.messages for select to authenticated using (public.is_party(request_id));
create policy "Parties send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_open(request_id));

create table public.meeting_prefs (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  free_from timestamptz not null,
  free_to timestamptz not null,
  place text not null default '' check (char_length(place) <= 200),
  updated_at timestamptz not null default now(),
  primary key (request_id, user_id),
  check (free_to > free_from)
);
grant select, insert, update on public.meeting_prefs to authenticated;
grant all on public.meeting_prefs to service_role;
alter table public.meeting_prefs enable row level security;
create policy "Parties read meeting" on public.meeting_prefs for select to authenticated using (public.is_party(request_id));
create policy "Own meeting insert" on public.meeting_prefs for insert to authenticated with check (user_id = auth.uid() and public.chat_open(request_id));
create policy "Own meeting update" on public.meeting_prefs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and public.chat_open(request_id));

create table public.request_photos (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  choice text not null check (choice in ('profile','other','skip')),
  photo_path text,
  updated_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
grant select, insert, update on public.request_photos to authenticated;
grant all on public.request_photos to service_role;
alter table public.request_photos enable row level security;
create policy "Parties read photo choices" on public.request_photos for select to authenticated using (public.is_party(request_id));
create policy "Own photo choice insert" on public.request_photos for insert to authenticated with check (user_id = auth.uid() and public.chat_open(request_id));
create policy "Own photo choice update" on public.request_photos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.request_addresses (
  request_id uuid primary key references public.requests(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  home_pickup boolean not null default false,
  address text not null default '' check (char_length(address) <= 300),
  shared boolean not null default false,
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.request_addresses to authenticated;
grant all on public.request_addresses to service_role;
alter table public.request_addresses enable row level security;
create policy "Owner or shared borrower reads address" on public.request_addresses for select to authenticated
  using (owner_id = auth.uid() or (shared and exists (select 1 from public.requests r where r.id = request_id and r.borrower_id = auth.uid())));
create policy "Owner adds address" on public.request_addresses for insert to authenticated
  with check (owner_id = auth.uid() and exists (select 1 from public.requests r where r.id = request_id and r.owner_id = auth.uid()));
create policy "Owner edits address" on public.request_addresses for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- ratings ----------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  rater_id uuid not null,
  ratee_id uuid not null,
  person_stars int not null check (person_stars between 1 and 5),
  item_stars int check (item_stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (request_id, rater_id)
);
grant select on public.ratings to authenticated;
grant all on public.ratings to service_role;
alter table public.ratings enable row level security;
create policy "Parties read ratings" on public.ratings for select to authenticated using (public.is_party(request_id));

-- ---------- reports ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  reporter_id uuid not null,
  against_id uuid not null,
  area text not null default 'Multan',
  kind text not null check (kind in ('late','damage','other')),
  description text not null check (char_length(description) between 1 and 1500),
  photo_path text,
  status text not null default 'open' check (status in ('open','replied','decided','appealed','closed')),
  reply text,
  reply_at timestamptz,
  decision text,
  decision_action text check (decision_action in ('none','reminder','warning','restriction')),
  decided_by uuid,
  decided_at timestamptz,
  appeal text,
  appeal_by uuid,
  appeal_at timestamptz,
  appeal_decision text,
  appeal_decided_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.reports to authenticated;
grant all on public.reports to service_role;
alter table public.reports enable row level security;
create policy "Parties and area admins read reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or against_id = auth.uid() or public.has_area_role(auth.uid(), 'area_admin', area));

-- ---------- time & availability ----------
create or replace function public.fmt_time(t time) returns text language sql immutable as $$
  select to_char(('2000-01-01'::date + t), 'FMHH12:MI AM')
$$;

create or replace function public.item_time_check(_item public.items, _from timestamptz, _to timestamptz)
returns text language plpgsql stable set search_path = public as $$
declare
  lf timestamp := _from at time zone 'Asia/Karachi';
  lt timestamp;
  d date;
begin
  if _from is null then return 'Pickup time missing'; end if;
  if not (extract(dow from lf)::int = any(_item.avail_days)) then
    return 'Not available on ' || to_char(lf, 'FMDay');
  end if;
  if lf::time < _item.avail_start then return 'Available only from ' || public.fmt_time(_item.avail_start); end if;
  if lf::time > _item.avail_end then return 'Available only until ' || public.fmt_time(_item.avail_end); end if;
  if _item.kind = 'return' and _to is not null then
    lt := _to at time zone 'Asia/Karachi';
    for d in select generate_series(lf::date, lt::date, interval '1 day')::date loop
      if not (extract(dow from d)::int = any(_item.avail_days)) then
        return 'Not available on ' || to_char(d, 'FMDay');
      end if;
    end loop;
    if lt::time > _item.avail_end or (lt::date > lf::date and lt::time < _item.avail_start) then
      return 'Needs it back by ' || public.fmt_time(_item.avail_end);
    end if;
  end if;
  return null;
end $$;

create or replace function public.item_free_qty(_item uuid, _from timestamptz, _to timestamptz, _exclude uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select i.quantity - coalesce((
    select sum(case when i.kind = 'use_up' then r.quantity - r.picked_up_qty else r.quantity - r.returned_qty end)
    from public.requests r
    where r.item_id = i.id and r.status = 'confirmed' and (_exclude is null or r.id <> _exclude)
      and (
        i.kind = 'use_up'
        or (r.picked_up_qty > r.returned_qty and r.return_at < coalesce(_to, _from))
        or (r.pickup_at < coalesce(_to, _from + interval '1 hour') and coalesce(r.return_at, r.pickup_at + interval '1 hour') > _from)
      )
  ), 0)
  from public.items i where i.id = _item
$$;

-- ---------- matching (checks real item data) ----------
create or replace function public.match_items(_want uuid, _km numeric)
returns table(item_id uuid, owner_id uuid, owner_name text, item_name text, photo_path text, kind text, unit text,
  price_rs numeric, price_per numeric, distance_km numeric, owner_limit_km numeric, allow_outside boolean,
  free_qty numeric, time_note text, avg_rating numeric, rating_count int, text_score real,
  ai_summary text, needs_summary boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare w public.wants;
begin
  select * into w from public.wants where id = _want;
  if w.id is null then raise exception 'Not found'; end if;
  if auth.uid() is distinct from w.borrower_id and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  return query
  select i.id, i.owner_id, split_part(p.display_name, ' ', 1), i.name, i.photo_path, i.kind, i.unit,
    i.price_rs, i.price_per,
    round(public.km_between(w.lat, w.lng, i.lat, i.lng)::numeric, 1),
    i.max_distance_km, i.allow_outside,
    public.item_free_qty(i.id, w.pickup_at, w.return_at),
    public.item_time_check(i, w.pickup_at, w.return_at),
    rt.avg_r, rt.cnt,
    greatest(similarity(lower(i.name), lower(coalesce(w.item_name, ''))),
             case when i.ai_keywords && w.ai_keywords then 1 else 0 end)::real,
    i.ai_summary, (i.ai_summary is null or i.summary_stale)
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> w.borrower_id and not p.restricted
    and public.km_between(w.lat, w.lng, i.lat, i.lng) <= _km
    and (
      i.ai_keywords && w.ai_keywords
      or similarity(lower(i.name), lower(coalesce(w.item_name, ''))) > 0.25
      or (coalesce(w.item_name, '') <> '' and lower(i.name) like '%' || lower(w.item_name) || '%')
    )
  order by 10;
end $$;
revoke execute on function public.match_items(uuid, numeric) from anon, public;
grant execute on function public.match_items(uuid, numeric) to authenticated, service_role;

-- Nearby list for the Find screen
create or replace function public.nearby_items(_km numeric)
returns table(item_id uuid, owner_name text, item_name text, photo_path text, kind text, unit text,
  free_qty numeric, price_rs numeric, price_per numeric, distance_km numeric, avg_rating numeric, rating_count int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not allowed'; end if;
  return query
  select i.id, split_part(p.display_name, ' ', 1), i.name, i.photo_path, i.kind, i.unit,
    public.item_free_qty(i.id, now(), now() + interval '1 hour'),
    i.price_rs, i.price_per,
    round(public.km_between(me.lat, me.lng, i.lat, i.lng)::numeric, 1),
    rt.avg_r, rt.cnt
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> me.id and not p.restricted
    and public.km_between(me.lat, me.lng, i.lat, i.lng) <= least(_km, greatest(i.max_distance_km, case when i.allow_outside then _km else 0 end))
  order by 10
  limit 60;
end $$;
revoke execute on function public.nearby_items(numeric) from anon, public;
grant execute on function public.nearby_items(numeric) to authenticated;

-- Average rating shown on my own items
create or replace function public.item_ratings(_ids uuid[])
returns table(item_id uuid, avg_rating numeric, rating_count int)
language sql stable security definer set search_path = public as $$
  select rq.item_id, round(avg(ra.item_stars)::numeric, 1), count(ra.item_stars)::int
  from public.ratings ra join public.requests rq on rq.id = ra.request_id
  where rq.item_id = any(_ids) and ra.item_stars is not null
  group by rq.item_id
$$;
grant execute on function public.item_ratings(uuid[]) to authenticated;

-- ---------- sending requests (borrower) ----------
create or replace function public.send_requests(_want uuid, _allocs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.wants; a jsonb; it public.items; q numeric; n int := 0; dist numeric;
  exc boolean; note_txt text; tn text; already numeric; me public.profiles;
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
      continue; -- already sent (double tap)
    end if;
    q := (a->>'quantity')::numeric;
    if q is null or q <= 0 then raise exception 'Please choose how many you need.'; end if;
    select coalesce(sum(quantity), 0) into already from public.requests where want_id = _want and status in ('requested','confirmed','completed');
    if already + q > w.quantity then raise exception 'That is more than you asked for.'; end if;
    exc := coalesce((a->>'is_exception')::boolean, false);
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
    insert into public.requests (want_id, item_id, borrower_id, owner_id, item_name, item_photo, unit, owner_name,
      borrower_name, kind, quantity, total_rs, pickup_at, return_at, is_exception, note)
    select _want, it.id, w.borrower_id, it.owner_id, it.name, it.photo_path, it.unit, split_part(p.display_name, ' ', 1),
      case when exc then null else split_part(me.display_name, ' ', 1) end,
      it.kind, q,
      case when it.kind = 'use_up' then round(it.price_rs * q / it.price_per) else it.price_rs * q end,
      w.pickup_at, case when it.kind = 'return' then w.return_at else null end, exc, note_txt
    from public.profiles p where p.id = it.owner_id;
    n := n + 1;
  end loop;

  update public.wants set status = 'active', pending_plan = null, updated_at = now() where id = _want;
  return n;
end $$;
revoke execute on function public.send_requests(uuid, jsonb) from anon, public;
grant execute on function public.send_requests(uuid, jsonb) to authenticated;

create or replace function public.cancel_request(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = _req for update;
  if r.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status not in ('requested','confirmed') or r.picked_up_qty > 0 then raise exception 'This can no longer be cancelled.'; end if;
  update public.requests set status = 'cancelled', updated_at = now() where id = _req;
end $$;
grant execute on function public.cancel_request(uuid) to authenticated;

-- ---------- owner answers ----------
create or replace function public.respond_request(_req uuid, _accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; bname text;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'requested' then return r.want_id; end if; -- already answered (double tap)
  if _accept then
    perform 1 from public.items where id = r.item_id for update;
    if public.item_free_qty(r.item_id, r.pickup_at, r.return_at) < r.quantity then
      raise exception 'You no longer have enough free for these times.';
    end if;
    select split_part(display_name, ' ', 1) into bname from public.profiles where id = r.borrower_id;
    update public.requests set status = 'confirmed', decided_at = now(), updated_at = now(), borrower_name = bname where id = _req;
    insert into public.messages (request_id, sender_id, body)
      values (_req, null, 'Request confirmed. Tell each other when you are free and where you would like to meet.');
  else
    update public.requests set status = 'declined', decided_at = now(), updated_at = now() where id = _req;
  end if;
  return r.want_id;
end $$;
grant execute on function public.respond_request(uuid, boolean) to authenticated;

-- ---------- pickups & returns ----------
create or replace function public.record_handover(_req uuid, _picked numeric, _returned numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; p numeric; rt numeric;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
  p := least(r.quantity, greatest(r.picked_up_qty, coalesce(_picked, r.picked_up_qty)));
  if r.kind = 'use_up' then
    if p > r.picked_up_qty then
      update public.items set quantity = greatest(0, quantity - (p - r.picked_up_qty)) where id = r.item_id;
    end if;
    update public.requests set picked_up_qty = p, updated_at = now(),
      status = case when p >= r.quantity then 'completed' else status end where id = _req;
    return;
  end if;
  rt := least(p, greatest(0, coalesce(_returned, r.returned_qty)));
  update public.requests set picked_up_qty = p, returned_qty = rt, updated_at = now(),
    status = case when rt >= r.quantity then 'completed' else status end where id = _req;
  if rt >= r.quantity then
    insert into public.messages (request_id, sender_id, body) values (_req, null, 'Everything is back. You can now rate each other.');
  end if;
end $$;
grant execute on function public.record_handover(uuid, numeric, numeric) to authenticated;

create or replace function public.send_reminder(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = _req;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
  insert into public.messages (request_id, sender_id, body)
    values (_req, null, 'Friendly reminder: ' || (r.quantity - r.returned_qty)::text || ' ' || r.item_name || ' still need to come back.');
end $$;
grant execute on function public.send_reminder(uuid) to authenticated;

-- ---------- ratings ----------
create or replace function public.rate_exchange(_req uuid, _person_stars int, _item_stars int, _comment text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; other uuid;
begin
  select * into r from public.requests where id = _req;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status <> 'completed' then raise exception 'You can rate once the exchange is complete.'; end if;
  other := case when r.borrower_id = auth.uid() then r.owner_id else r.borrower_id end;
  insert into public.ratings (request_id, rater_id, ratee_id, person_stars, item_stars, comment)
  values (_req, auth.uid(), other, _person_stars,
    case when r.borrower_id = auth.uid() then _item_stars else null end, nullif(left(coalesce(_comment, ''), 500), ''))
  on conflict (request_id, rater_id) do nothing;
end $$;
grant execute on function public.rate_exchange(uuid, int, int, text) to authenticated;

-- ---------- reports & area admin review ----------
create or replace function public.create_report(_req uuid, _kind text, _description text, _photo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; rid uuid; ar text;
begin
  select * into r from public.requests where id = _req;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  select city into ar from public.items where id = r.item_id;
  insert into public.reports (request_id, reporter_id, against_id, area, kind, description, photo_path)
  values (_req, auth.uid(), case when r.borrower_id = auth.uid() then r.owner_id else r.borrower_id end,
    coalesce(ar, 'Multan'), _kind, left(_description, 1500), _photo)
  returning id into rid;
  return rid;
end $$;
grant execute on function public.create_report(uuid, text, text, text) to authenticated;

create or replace function public.reply_report(_id uuid, _reply text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reports set reply = left(_reply, 1500), reply_at = now(), status = case when status = 'open' then 'replied' else status end
  where id = _id and against_id = auth.uid() and status in ('open','replied');
  if not found then raise exception 'Not allowed'; end if;
end $$;
grant execute on function public.reply_report(uuid, text) to authenticated;

create or replace function public.decide_report(_id uuid, _decision text, _action text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  select * into rp from public.reports where id = _id for update;
  if rp.id is null or not public.has_area_role(auth.uid(), 'area_admin', rp.area) then raise exception 'Not allowed'; end if;
  if _action not in ('none','reminder','warning','restriction') then raise exception 'Unknown action'; end if;
  update public.reports set decision = left(_decision, 1500), decision_action = _action, decided_by = auth.uid(),
    decided_at = now(), status = 'decided' where id = _id;
  if _action = 'reminder' then
    insert into public.messages (request_id, sender_id, body) values (rp.request_id, null,
      'Reminder from your area admin: please sort out this booking soon.');
  elsif _action = 'restriction' then
    update public.profiles set restricted = true where id = rp.against_id;
  end if;
end $$;
grant execute on function public.decide_report(uuid, text, text) to authenticated;

create or replace function public.appeal_report(_id uuid, _appeal text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reports set appeal = left(_appeal, 1500), appeal_by = auth.uid(), appeal_at = now(), status = 'appealed'
  where id = _id and status = 'decided' and (reporter_id = auth.uid() or against_id = auth.uid());
  if not found then raise exception 'Not allowed'; end if;
end $$;
grant execute on function public.appeal_report(uuid, text) to authenticated;

create or replace function public.decide_appeal(_id uuid, _decision text, _lift boolean)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  select * into rp from public.reports where id = _id for update;
  if rp.id is null or not public.has_area_role(auth.uid(), 'area_admin', rp.area) then raise exception 'Not allowed'; end if;
  if rp.status <> 'appealed' then raise exception 'There is no appeal to review.'; end if;
  update public.reports set appeal_decision = left(_decision, 1500), appeal_decided_at = now(), status = 'closed' where id = _id;
  if _lift then update public.profiles set restricted = false where id = rp.against_id; end if;
end $$;
grant execute on function public.decide_appeal(uuid, text, boolean) to authenticated;

-- names of people you have a booking with (first name only)
create or replace function public.party_names(_ids uuid[])
returns table(id uuid, first_name text)
language sql stable security definer set search_path = public as $$
  select p.id, split_part(p.display_name, ' ', 1) from public.profiles p
  where p.id = any(_ids) and (p.id = auth.uid() or exists (
    select 1 from public.requests r where r.status in ('confirmed','completed')
      and ((r.borrower_id = auth.uid() and r.owner_id = p.id) or (r.owner_id = auth.uid() and r.borrower_id = p.id))
  ) or exists (select 1 from public.reports rp where (rp.reporter_id = p.id or rp.against_id = p.id) and public.has_area_role(auth.uid(), 'area_admin', rp.area)))
$$;
grant execute on function public.party_names(uuid[]) to authenticated;

-- revoke default public execute on internal helpers
revoke execute on function public.item_free_qty(uuid, timestamptz, timestamptz, uuid) from anon, public;
grant execute on function public.item_free_qty(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;