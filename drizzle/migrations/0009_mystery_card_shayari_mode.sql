-- ================= Mystery Card 2: Shayari Mode =================

-- remembered choices (members may change only these new columns)
alter table public.profiles add column if not exists shayari_language text not null default 'roman_urdu'
  check (shayari_language in ('urdu','roman_urdu','english'));
alter table public.profiles add column if not exists shayari_tone text not null default 'friendly'
  check (shayari_tone in ('friendly','funny'));
grant update (shayari_language, shayari_tone) on public.profiles to authenticated;

-- server-made previews: written only by the server after its checks, readable only by their author
create table public.shayari_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  context text not null check (context in ('dm','exception','thanks')),
  request_id uuid references public.requests(id) on delete cascade,
  item_id uuid references public.items(id) on delete cascade,
  source_key text not null,
  original text not null check (char_length(original) between 1 and 1000),
  key_message text not null check (char_length(key_message) between 1 and 600),
  language text not null check (language in ('urdu','roman_urdu','english')),
  tone text not null check (tone in ('friendly','funny')),
  lines text[] not null check (array_length(lines, 1) = 2),
  meaning text not null check (char_length(meaning) between 1 and 800),
  created_at timestamptz not null default now(),
  check ((context in ('dm','thanks') and request_id is not null) or (context = 'exception' and item_id is not null))
);
create index shayari_previews_user_idx on public.shayari_previews(user_id, source_key, created_at desc);
grant select on public.shayari_previews to authenticated;
grant all on public.shayari_previews to service_role;
alter table public.shayari_previews enable row level security;
create policy "Authors read own rhyme previews" on public.shayari_previews for select to authenticated using (user_id = auth.uid());

-- every generation try counts towards a small per-person limit (server only)
create table public.shayari_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index shayari_attempts_user_idx on public.shayari_attempts(user_id, created_at desc);
grant all on public.shayari_attempts to service_role;
alter table public.shayari_attempts enable row level security;

-- messages: kind + exact sent snapshot; members insert only plain text directly
alter table public.messages add column if not exists kind text not null default 'text' check (kind in ('text','shayari','thanks'));
alter table public.messages add column if not exists shayari jsonb;
alter table public.messages add column if not exists preview_id uuid unique references public.shayari_previews(id) on delete set null;
revoke insert on public.messages from authenticated;
grant insert (request_id, sender_id, body, client_id) on public.messages to authenticated;

-- exception requests: the approved rhyme snapshot shown to the owner
alter table public.requests add column if not exists note_shayari jsonb;

create or replace function public.has_contact(_t text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(_t, '') ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
      or coalesce(_t, '') ~ '\+?[0-9][0-9 -]{6,}[0-9]'
$$;

create or replace function public.booking_done(r public.requests)
returns boolean language sql immutable set search_path = public as $$
  select r.status = 'completed' and case when r.kind = 'use_up' then r.picked_up_qty >= r.quantity
                                         else r.picked_up_qty >= r.quantity and r.returned_qty >= r.quantity end
$$;

-- one entry point for rhymes and thank-you cards; repeat taps/retries return the first message
create or replace function public.send_rich_message(_req uuid, _client_id uuid, _kind text, _preview uuid, _body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; pv public.shayari_previews; me public.profiles; mid uuid; body_txt text; snap jsonb;
begin
  if _kind not in ('shayari','thanks') then raise exception 'Unknown message type.'; end if;
  if _client_id is null then raise exception 'Missing message id.'; end if;
  select * into r from public.requests where id = _req for update;
  if r.id is null or (r.borrower_id is distinct from auth.uid() and r.owner_id is distinct from auth.uid()) then
    raise exception 'Not allowed';
  end if;
  select id into mid from public.messages where request_id = _req and sender_id = auth.uid() and client_id = _client_id;
  if mid is not null then return mid; end if;
  if _preview is not null then
    select id into mid from public.messages where preview_id = _preview;
    if mid is not null then return mid; end if;
  end if;
  if r.status not in ('confirmed','completed') then raise exception 'Chat opens after the owner says yes.'; end if;
  if public.is_blocked(r.owner_id, r.borrower_id) then raise exception 'Chat is closed.'; end if;
  select * into me from public.profiles where id = auth.uid();
  if _kind = 'thanks' then
    if auth.uid() <> r.borrower_id then raise exception 'Only the borrower can send a thank-you card.'; end if;
    if me.restricted then raise exception 'Your account is paused after a review, so thank-you cards are off.'; end if;
    if not public.booking_done(r) then raise exception 'You can say thanks once the owner confirms everything is back.'; end if;
  end if;
  if _preview is not null then
    select * into pv from public.shayari_previews where id = _preview;
    if pv.id is null or pv.user_id <> auth.uid() or pv.request_id is distinct from _req
       or pv.context <> (case when _kind = 'thanks' then 'thanks' else 'dm' end) then
      raise exception 'This rhyme is not available. Please make it again.';
    end if;
    body_txt := pv.lines[1] || E'\n' || pv.lines[2];
    snap := jsonb_build_object('original', pv.original, 'key_message', pv.key_message, 'lines', to_jsonb(pv.lines),
      'meaning', pv.meaning, 'language', pv.language, 'tone', pv.tone);
  else
    if _kind <> 'thanks' then raise exception 'Please make the rhyme first.'; end if;
    body_txt := btrim(coalesce(_body, ''));
    if char_length(body_txt) not between 1 and 1000 then raise exception 'Please write a short message.'; end if;
  end if;
  insert into public.messages (request_id, sender_id, body, client_id, kind, shayari, preview_id)
  values (_req, auth.uid(), body_txt, _client_id, _kind, snap, _preview) returning id into mid;
  return mid;
end $$;
revoke execute on function public.send_rich_message(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.send_rich_message(uuid, uuid, text, uuid, text) to authenticated;
revoke execute on function public.booking_done(public.requests) from public, anon;
grant execute on function public.booking_done(public.requests) to authenticated;

create or replace function public.messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  if new.sender_id is null then return new; end if;
  select * into r from public.requests where id = new.request_id;
  if new.kind = 'thanks' then
    perform public.notify(r.owner_id, 'message', 'Thank-you card', 'The borrower said thanks for ' || lower(r.item_name) || '.', r.id, null, 'msg:' || r.id, true);
  else
    perform public.notify(case when new.sender_id = r.owner_id then r.borrower_id else r.owner_id end,
      'message', 'New message', 'New message about ' || lower(r.item_name) || '.', r.id, null, 'msg:' || r.id, true);
  end if;
  return new;
end $$;
revoke execute on function public.messages_notify() from public, anon, authenticated;

-- send_requests: exception requests may carry a server-checked rhyme preview
create or replace function public.send_requests(_want uuid, _allocs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.wants; a jsonb; it public.items; q numeric; n int := 0; dist numeric;
  exc boolean; note_txt text; tn text; already numeric; me public.profiles; idx int; lbl text; total numeric; expected numeric;
  pv public.shayari_previews; snap jsonb;
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
    if public.is_demo_user(it.owner_id) is distinct from me.is_demo then raise exception 'This item is not available to you.'; end if;
    if public.is_blocked(it.owner_id, w.borrower_id) then raise exception 'This item is not available to you.'; end if;
    if exists (select 1 from public.requests where borrower_id = w.borrower_id and item_id = it.id and status = 'requested') then
      raise exception 'You already have a request waiting for this %.', lower(it.name);
    end if;
    q := (a->>'quantity')::numeric;
    if q is null or q <= 0 then raise exception 'Please choose how many you need.'; end if;
    if it.kind = 'use_up' and it.min_amount is not null and q < it.min_amount then
      raise exception 'The smallest amount for % is % %.', lower(it.name), public.num_txt(it.min_amount), it.unit;
    end if;
    if it.kind = 'use_up' and it.step_amount is not null and mod(q, it.step_amount) <> 0 then
      raise exception '% comes in steps of % %.', it.name, public.num_txt(it.step_amount), it.unit;
    end if;
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
      raise exception 'Only % left for %.', public.num_txt(public.item_free_qty(it.id, w.pickup_at, w.return_at)), it.name;
    end if;
    total := public.price_for(it.kind, it.price_rs, it.price_per, it.price_period, q, w.pickup_at, w.return_at);
    expected := nullif(a->>'expected_total', '')::numeric;
    if expected is not null and expected <> total then
      raise exception 'The price for % changed to Rs %. Please check the new total.', lower(it.name), public.num_txt(total);
    end if;
    note_txt := null;
    snap := null;
    if exc then
      if nullif(a->>'shayari_preview', '') is not null then
        select * into pv from public.shayari_previews where id = (a->>'shayari_preview')::uuid;
        if pv.id is null or pv.user_id <> auth.uid() or pv.context <> 'exception' or pv.item_id <> it.id then
          raise exception 'This rhyme is not available. Please make it again.';
        end if;
        if public.has_contact(pv.original) or public.has_contact(pv.meaning) or public.has_contact(pv.lines[1]) or public.has_contact(pv.lines[2]) then
          raise exception 'This rhyme still has contact details. Please edit your message.';
        end if;
        note_txt := left(pv.original, 300);
        snap := jsonb_build_object('original', pv.original, 'key_message', pv.key_message, 'lines', to_jsonb(pv.lines),
          'meaning', pv.meaning, 'language', pv.language, 'tone', pv.tone, 'preview_id', pv.id);
      else
        note_txt := left(regexp_replace(regexp_replace(coalesce(a->>'note', ''),
          '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[hidden]', 'g'),
          '\+?[0-9][0-9 -]{6,}[0-9]', '[hidden]', 'g'), 300);
      end if;
    end if;
    select count(*) into idx from public.requests where want_id = _want;
    lbl := 'Owner ' || chr(65 + (idx % 26));
    insert into public.requests (want_id, item_id, borrower_id, owner_id, item_name, item_photo, unit, owner_name,
      borrower_name, kind, quantity, total_rs, pickup_at, return_at, is_exception, exception_status, note, note_shayari, agreed)
    values (_want, it.id, w.borrower_id, it.owner_id, it.name, it.photo_path, it.unit, lbl,
      null, it.kind, q, total,
      w.pickup_at, case when it.kind = 'return' then w.return_at else null end, exc, case when exc then 'pending' else null end, note_txt, snap,
      jsonb_build_object('description', it.description, 'specs', it.specs, 'price_rs', it.price_rs,
        'price_per', it.price_per, 'price_period', it.price_period, 'unit', it.unit, 'kind', it.kind, 'area_name', it.area_name,
        'condition', it.condition, 'accessories', it.accessories, 'category', it.category, 'measured', it.measured));
    n := n + 1;
  end loop;

  update public.wants set status = 'active', pending_plan = null, updated_at = now() where id = _want;
  return n;
end $$;
revoke execute on function public.send_requests(uuid, jsonb) from anon, public;
grant execute on function public.send_requests(uuid, jsonb) to authenticated;