-- ================= Phase 3 =================

-- ---------- small helpers ----------
create or replace function public.num_txt(n numeric)
returns text language sql immutable set search_path = public as $$
  select case when n is null then '' when n = trunc(n) then trunc(n)::bigint::text else rtrim(rtrim(n::text, '0'), '.') end
$$;

create or replace function public.fmt_ts(t timestamptz)
returns text language sql stable set search_path = public as $$
  select to_char(t at time zone 'Asia/Karachi', 'FMDy DD Mon, FMHH12:MI AM')
$$;

create or replace function public.is_demo_user(_u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_demo from public.profiles where id = _u), false)
$$;
revoke execute on function public.is_demo_user(uuid) from public, anon;
grant execute on function public.is_demo_user(uuid) to authenticated, service_role;

-- Price for an amount. Rupees; per-day prices count started days between pickup and return.
create or replace function public.price_for(_kind text, _price numeric, _per numeric, _period text, _qty numeric,
  _from timestamptz, _to timestamptz)
returns numeric language sql immutable set search_path = public as $$
  select case
    when coalesce(_price, 0) = 0 then 0
    when _kind = 'use_up' then round(_price * _qty / coalesce(nullif(_per, 0), 1))
    when _period = 'day' then _price * _qty * greatest(1, ceil(extract(epoch from (coalesce(_to, _from) - _from)) / 86400.0))
    else _price * _qty
  end
$$;

-- ---------- identity status (separate from email confirmation) ----------
alter table public.profiles add column if not exists identity_status text not null default 'test_number';
alter table public.profiles drop constraint if exists profiles_identity_status_check;
alter table public.profiles add constraint profiles_identity_status_check check (identity_status in ('none','test_number','verified'));

-- ---------- richer listings ----------
alter table public.items add column if not exists photo_paths text[] not null default '{}';
alter table public.items add column if not exists category text not null default '';
alter table public.items add column if not exists condition text not null default '';
alter table public.items add column if not exists accessories text not null default '';
alter table public.items add column if not exists price_period text not null default 'each';
alter table public.items add column if not exists min_amount numeric;
alter table public.items add column if not exists step_amount numeric;
alter table public.items add column if not exists measured boolean not null default true;
alter table public.items add constraint items_category_len check (char_length(category) <= 60);
alter table public.items add constraint items_condition_len check (char_length(condition) <= 200);
alter table public.items add constraint items_accessories_len check (char_length(accessories) <= 300);
alter table public.items add constraint items_price_period_check check (price_period in ('each','day'));
alter table public.items add constraint items_min_amount_check check (min_amount is null or min_amount > 0);
alter table public.items add constraint items_step_amount_check check (step_amount is null or step_amount > 0);
alter table public.items add constraint items_photo_paths_max check (coalesce(array_length(photo_paths, 1), 0) <= 6);
update public.items set photo_paths = array[photo_path] where photo_path is not null and photo_paths = '{}';

create or replace function public.items_mark_stale()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.name, new.description, new.specs, new.kind, new.unit, new.category, new.condition, new.accessories)
     is distinct from (old.name, old.description, old.specs, old.kind, old.unit, old.category, old.condition, old.accessories)
     and new.ai_summary is not distinct from old.ai_summary then
    new.summary_stale := true;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- every listing photo must be the owner's own file
create or replace function public.items_photo_check()
returns trigger language plpgsql set search_path = public as $$
declare p text;
begin
  foreach p in array coalesce(new.photo_paths, '{}') loop
    if split_part(p, '/', 1) <> new.owner_id::text then raise exception 'Not allowed'; end if;
  end loop;
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.owner_id::text then raise exception 'Not allowed'; end if;
  return new;
end $$;
drop trigger if exists items_photo_check on public.items;
create trigger items_photo_check before insert or update on public.items for each row execute function public.items_photo_check();

-- ---------- booking states ----------
alter table public.requests drop constraint requests_status_check;
alter table public.requests add constraint requests_status_check
  check (status in ('requested','confirmed','declined','cancelled','completed','expired'));
alter table public.requests add column if not exists exception_status text;
alter table public.requests add constraint requests_exception_status_check
  check (exception_status is null or exception_status in ('pending','approved','declined'));
alter table public.requests add column if not exists borrower_picked_qty numeric not null default 0;
alter table public.requests add column if not exists borrower_returned_qty numeric not null default 0;
alter table public.requests add column if not exists payment_status text not null default 'none';
alter table public.requests add constraint requests_payment_status_check
  check (payment_status in ('none','reported_paid','confirmed_paid'));
alter table public.requests add column if not exists payment_reported_by uuid;
alter table public.requests add column if not exists payment_confirmed_by uuid;
alter table public.requests add column if not exists cancelled_by uuid;
alter table public.requests add column if not exists cancel_reason text;
alter table public.requests add column if not exists condition_photos jsonb not null default '[]';
update public.requests set exception_status = case when status = 'requested' then 'pending' when status = 'declined' then 'declined' else 'approved' end
where is_exception and exception_status is null;

-- ---------- messages: no duplicates on retry; blocked people can't chat ----------
alter table public.messages add column if not exists client_id uuid;
create unique index if not exists messages_client_once on public.messages(request_id, sender_id, client_id) where client_id is not null;
drop policy if exists "Parties send messages" on public.messages;
create policy "Parties send messages" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.chat_open(request_id)
    and not exists (select 1 from public.requests r where r.id = request_id and public.is_blocked(r.owner_id, r.borrower_id)));

create table public.chat_reads (
  request_id uuid not null references public.requests(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  last_read_at timestamptz not null default now(),
  primary key (request_id, user_id)
);
grant select on public.chat_reads to authenticated;
grant all on public.chat_reads to service_role;
alter table public.chat_reads enable row level security;
create policy "Read own chat reads" on public.chat_reads for select to authenticated using (user_id = auth.uid());

create or replace function public.mark_chat_read(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_party(_req) then raise exception 'Not allowed'; end if;
  insert into public.chat_reads (request_id, user_id, last_read_at) values (_req, auth.uid(), now())
  on conflict (request_id, user_id) do update set last_read_at = now();
  update public.notifications set read_at = now() where user_id = auth.uid() and request_id = _req and kind = 'message' and read_at is null;
end $$;

create or replace function public.unread_counts()
returns table(request_id uuid, unread int) language sql stable security definer set search_path = public as $$
  select m.request_id, count(*)::int
  from public.messages m
  join public.requests r on r.id = m.request_id
  left join public.chat_reads cr on cr.request_id = m.request_id and cr.user_id = auth.uid()
  where (r.borrower_id = auth.uid() or r.owner_id = auth.uid())
    and m.sender_id is distinct from auth.uid()
    and m.created_at > coalesce(cr.last_read_at, '-infinity'::timestamptz)
  group by m.request_id
$$;

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text not null default '',
  request_id uuid references public.requests(id) on delete cascade,
  want_id uuid references public.wants(id) on delete cascade,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());

-- Internal: one notification per key. _bump = true brings an existing one back as unread (new chat messages).
create or replace function public.notify(_user uuid, _kind text, _title text, _body text, _req uuid, _want uuid, _key text, _bump boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _user is null then return; end if;
  if _bump then
    insert into public.notifications (user_id, kind, title, body, request_id, want_id, dedupe_key)
    values (_user, _kind, _title, _body, _req, _want, _key)
    on conflict (user_id, dedupe_key) do update set title = excluded.title, body = excluded.body, read_at = null, created_at = now();
  else
    insert into public.notifications (user_id, kind, title, body, request_id, want_id, dedupe_key)
    values (_user, _kind, _title, _body, _req, _want, _key)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
end $$;

create or replace function public.mark_notifications_read(_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (_ids is null or id = any(_ids))
$$;

create or replace function public.requests_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare what text := public.num_txt(new.quantity) || case when new.unit = 'item' then ' ' else ' ' || new.unit || ' of ' end || lower(new.item_name);
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.owner_id, 'request', 'New borrowing request',
      case when new.is_exception then 'Someone a bit farther away' else 'Someone nearby' end || ' wants ' || what || '.',
      new.id, null, 'req:' || new.id || ':new');
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.borrower_id, 'accepted', 'Request accepted', new.owner_name || ' said yes to ' || what || '. Ready to collect.', new.id, new.want_id, 'req:' || new.id || ':confirmed');
    elsif new.status = 'declined' then
      perform public.notify(new.borrower_id, 'declined', 'Request declined', old.owner_name || ' can''t lend ' || what || '.', new.id, new.want_id, 'req:' || new.id || ':declined');
    elsif new.status = 'cancelled' then
      if new.cancelled_by = new.borrower_id then
        perform public.notify(new.owner_id, 'cancelled', 'Request cancelled', 'The borrower cancelled ' || what || '. Nothing is reserved now.', new.id, null, 'req:' || new.id || ':cancelled');
      elsif new.cancelled_by = new.owner_id then
        perform public.notify(new.borrower_id, 'cancelled', 'Booking cancelled by the owner', new.owner_name || ' cancelled ' || what || '. We are looking for a replacement.', new.id, new.want_id, 'req:' || new.id || ':cancelled');
      end if;
    elsif new.status = 'expired' then
      perform public.notify(new.borrower_id, 'expired', 'Request expired', 'No answer before the pickup time for ' || what || '.', new.id, new.want_id, 'req:' || new.id || ':expired');
    elsif new.status = 'completed' then
      perform public.notify(new.borrower_id, 'completed', 'All done', 'You can now rate this exchange.', new.id, new.want_id, 'req:' || new.id || ':completed');
      perform public.notify(new.owner_id, 'completed', 'All done', 'You can now rate this exchange.', new.id, null, 'req:' || new.id || ':completed');
    end if;
  end if;
  if new.exception_status = 'approved' and old.exception_status is distinct from 'approved' then
    perform public.notify(new.borrower_id, 'exception', 'Distance allowed', 'The owner allowed the extra distance. Now waiting for their answer on the booking.', new.id, new.want_id, 'req:' || new.id || ':exception-ok');
  end if;
  if new.borrower_picked_qty > old.borrower_picked_qty then
    perform public.notify(new.owner_id, 'confirm', 'Please confirm the pickup',
      coalesce(new.borrower_name, 'The borrower') || ' says they collected ' || public.num_txt(new.borrower_picked_qty) || '.', new.id, null,
      'req:' || new.id || ':claim-pick:' || public.num_txt(new.borrower_picked_qty));
  end if;
  if new.borrower_returned_qty > old.borrower_returned_qty then
    perform public.notify(new.owner_id, 'confirm', 'Please confirm the return',
      coalesce(new.borrower_name, 'The borrower') || ' says they returned ' || public.num_txt(new.borrower_returned_qty) || '.', new.id, null,
      'req:' || new.id || ':claim-back:' || public.num_txt(new.borrower_returned_qty));
  end if;
  if new.payment_status = 'reported_paid' and old.payment_status = 'none' then
    perform public.notify(new.owner_id, 'confirm', 'Payment reported', 'The borrower says they paid you outside the app. Please confirm.', new.id, null, 'req:' || new.id || ':paid');
  end if;
  return new;
end $$;
drop trigger if exists requests_notify on public.requests;
create trigger requests_notify after insert or update on public.requests for each row execute function public.requests_notify();

create or replace function public.wants_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.pending_plan is not null
     and jsonb_array_length(coalesce(new.pending_plan->'lines', '[]'::jsonb)) > 0
     and (old.pending_plan is null or old.pending_plan->>'created_at' is distinct from new.pending_plan->>'created_at') then
    perform public.notify(new.borrower_id, 'replacement', 'Replacement found', 'We found someone for the missing amount. Approve it before we send a request.',
      null, new.id, 'want:' || new.id || ':plan:' || coalesce(new.pending_plan->>'created_at', ''));
  end if;
  return new;
end $$;
drop trigger if exists wants_notify on public.wants;
create trigger wants_notify after update of pending_plan on public.wants for each row execute function public.wants_notify();

create or replace function public.messages_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  if new.sender_id is null then return new; end if;
  select * into r from public.requests where id = new.request_id;
  perform public.notify(case when new.sender_id = r.owner_id then r.borrower_id else r.owner_id end,
    'message', 'New message', 'New message about ' || lower(r.item_name) || '.', r.id, null, 'msg:' || r.id, true);
  return new;
end $$;
drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages for each row execute function public.messages_notify();

-- ---------- date-change proposals ----------
create table public.date_changes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  proposed_by uuid not null,
  new_pickup_at timestamptz not null,
  new_return_at timestamptz,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index date_changes_one_pending on public.date_changes(request_id) where status = 'pending';
grant select on public.date_changes to authenticated;
grant all on public.date_changes to service_role;
alter table public.date_changes enable row level security;
create policy "Parties read date changes" on public.date_changes for select to authenticated using (public.is_party(request_id));

create or replace function public.date_change_check(r public.requests, _pickup timestamptz, _return timestamptz)
returns text language plpgsql stable security definer set search_path = public as $$
declare it public.items; tn text; need numeric;
begin
  if r.kind = 'return' and (_return is null or _return <= _pickup) then return 'The return time must be after pickup.'; end if;
  if r.picked_up_qty = 0 and _pickup < now() - interval '15 minutes' then return 'That pickup time has passed.'; end if;
  if r.picked_up_qty > 0 and _pickup is distinct from r.pickup_at then return 'The items are already picked up. You can only change the return time.'; end if;
  select * into it from public.items where id = r.item_id;
  tn := public.item_time_check(it, _pickup, case when r.kind = 'return' then _return else null end);
  if tn is not null then return tn; end if;
  need := case when r.kind = 'use_up' then r.quantity - r.picked_up_qty else r.quantity - r.returned_qty end;
  if public.item_free_qty(r.item_id, _pickup, case when r.kind = 'return' then _return else null end, r.id) < need then
    return 'That time clashes with another booking for this item.';
  end if;
  return null;
end $$;
revoke execute on function public.date_change_check(public.requests, timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.propose_date_change(_req uuid, _pickup timestamptz, _return timestamptz, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; msg text; dc uuid;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'Only active bookings can change dates.'; end if;
  if public.is_blocked(r.owner_id, r.borrower_id) then raise exception 'You can''t change dates with this person. Finish the return or ask your area admin for help.'; end if;
  select id into dc from public.date_changes where request_id = _req and status = 'pending' and proposed_by = auth.uid()
    and new_pickup_at = _pickup and new_return_at is not distinct from _return;
  if dc is not null then return dc; end if; -- same proposal again (retry)
  if exists (select 1 from public.date_changes where request_id = _req and status = 'pending') then
    raise exception 'A date change is already waiting for an answer.';
  end if;
  msg := public.date_change_check(r, _pickup, _return);
  if msg is not null then raise exception '%', msg; end if;
  insert into public.date_changes (request_id, proposed_by, new_pickup_at, new_return_at, note)
  values (_req, auth.uid(), _pickup, case when r.kind = 'return' then _return else null end, nullif(left(coalesce(_note, ''), 300), ''))
  returning id into dc;
  perform public.notify(case when auth.uid() = r.owner_id then r.borrower_id else r.owner_id end, 'date_change', 'New dates proposed',
    'Pickup ' || public.fmt_ts(_pickup) || coalesce(', back ' || public.fmt_ts(_return), '') || '. Please answer.', r.id, null, 'dc:' || dc);
  return dc;
end $$;

create or replace function public.answer_date_change(_id uuid, _accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d public.date_changes; r public.requests; msg text;
begin
  select * into d from public.date_changes where id = _id for update;
  if d.id is null then raise exception 'Not found'; end if;
  select * into r from public.requests where id = d.request_id for update;
  if not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if d.proposed_by = auth.uid() then raise exception 'The other person needs to answer this.'; end if;
  if d.status <> 'pending' then return; end if; -- already answered (retry)
  if not _accept then
    update public.date_changes set status = 'declined', decided_at = now() where id = _id;
    perform public.notify(d.proposed_by, 'date_change', 'Date change declined', 'The current dates stay.', r.id, null, 'dc:' || d.id || ':answer');
    return;
  end if;
  if r.status <> 'confirmed' then raise exception 'This booking is no longer active.'; end if;
  perform 1 from public.items where id = r.item_id for update;
  msg := public.date_change_check(r, d.new_pickup_at, d.new_return_at);
  if msg is not null then raise exception '% The current dates stay.', msg; end if;
  update public.requests set pickup_at = d.new_pickup_at, return_at = case when r.kind = 'return' then d.new_return_at else null end,
    total_rs = case when (r.agreed->>'price_period') = 'day'
      then public.price_for(r.kind, (r.agreed->>'price_rs')::numeric, (r.agreed->>'price_per')::numeric, 'day', r.quantity, d.new_pickup_at, d.new_return_at)
      else total_rs end,
    updated_at = now() where id = r.id;
  update public.date_changes set status = 'accepted', decided_at = now() where id = _id;
  insert into public.messages (request_id, sender_id, body) values (r.id, null,
    'New dates agreed: pickup ' || public.fmt_ts(d.new_pickup_at) || coalesce(', bring back ' || public.fmt_ts(d.new_return_at), '') || '.');
  perform public.notify(d.proposed_by, 'date_change', 'New dates accepted', 'Pickup ' || public.fmt_ts(d.new_pickup_at) || '.', r.id, null, 'dc:' || d.id || ':answer');
end $$;

create or replace function public.withdraw_date_change(_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.date_changes set status = 'withdrawn', decided_at = now()
  where id = _id and proposed_by = auth.uid() and status = 'pending'
$$;

-- ---------- cancel before pickup (either person) ----------
create or replace function public.cancel_booking(_req uuid, _reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; who text;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status not in ('requested','confirmed') then return r.want_id; end if; -- already done (retry)
  if r.picked_up_qty > 0 then raise exception 'Items were already handed over. Use the return steps instead.'; end if;
  if r.owner_id = auth.uid() and r.status = 'requested' then raise exception 'Use "No, sorry" to answer a request.'; end if;
  update public.requests set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = nullif(left(coalesce(_reason, ''), 300), ''),
    updated_at = now() where id = _req;
  update public.date_changes set status = 'withdrawn', decided_at = now() where request_id = _req and status = 'pending';
  if r.status = 'confirmed' then
    who := case when r.owner_id = auth.uid() then r.owner_name else coalesce(r.borrower_name, 'The borrower') end;
    insert into public.messages (request_id, sender_id, body) values (_req, null, who || ' cancelled this booking before pickup. Nothing is reserved now.');
  end if;
  return r.want_id;
end $$;

create or replace function public.cancel_request(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.cancel_booking(_req, null);
end $$;

-- ---------- exceptions: allow the distance first, then answer the booking ----------
create or replace function public.answer_exception(_req uuid, _allow boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if not r.is_exception or r.status <> 'requested' or coalesce(r.exception_status, 'pending') <> 'pending' then return r.want_id; end if;
  if _allow then
    update public.requests set exception_status = 'approved', updated_at = now() where id = _req;
  else
    update public.requests set exception_status = 'declined', status = 'declined', decided_at = now(), updated_at = now() where id = _req;
  end if;
  return r.want_id;
end $$;

create or replace function public.respond_request(_req uuid, _accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; bname text; oname text;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'requested' then return r.want_id; end if; -- already answered (double tap / retry)
  if r.pickup_at < now() - interval '15 minutes' then
    update public.requests set status = 'expired', updated_at = now() where id = _req;
    return r.want_id;
  end if;
  if _accept then
    if r.is_exception and coalesce(r.exception_status, 'pending') <> 'approved' then
      raise exception 'First say whether you allow the extra distance.';
    end if;
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
    update public.requests set status = 'declined', decided_at = now(), updated_at = now(),
      exception_status = case when r.is_exception then 'declined' else r.exception_status end where id = _req;
  end if;
  return r.want_id;
end $$;

-- ---------- pickups and returns: borrower reports, owner confirms ----------
create or replace function public.report_handover(_req uuid, _picked numeric, _returned numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; p numeric; b numeric; who text;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
  p := least(r.quantity, greatest(r.borrower_picked_qty, coalesce(_picked, 0)));
  b := least(greatest(p, r.picked_up_qty), greatest(r.borrower_returned_qty, coalesce(_returned, 0)));
  if p = r.borrower_picked_qty and b = r.borrower_returned_qty then return; end if; -- nothing new (retry)
  update public.requests set borrower_picked_qty = p, borrower_returned_qty = b, updated_at = now() where id = _req;
  who := coalesce(r.borrower_name, 'The borrower');
  if p > r.borrower_picked_qty then
    insert into public.messages (request_id, sender_id, body) values (_req, null, who || ' says they collected ' || public.num_txt(p) || '. Waiting for the owner to confirm.');
  end if;
  if b > r.borrower_returned_qty then
    insert into public.messages (request_id, sender_id, body) values (_req, null, who || ' says they returned ' || public.num_txt(b) || '. Waiting for the owner to confirm.');
  end if;
end $$;

create or replace function public.confirm_handover(_req uuid, _picked numeric, _returned numeric, _close_pickup boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; p numeric; rt numeric; newq numeric; newtotal numeric; done boolean;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Only the owner can confirm what was handed over or received.'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active.'; end if;
  p := least(r.quantity, greatest(r.picked_up_qty, coalesce(_picked, r.picked_up_qty)));
  newq := r.quantity;
  if coalesce(_close_pickup, false) and p > 0 and p < r.quantity then newq := p; end if;
  newtotal := case when newq <> r.quantity then round(r.total_rs * newq / r.quantity) else r.total_rs end;
  if r.kind = 'use_up' then
    if p > r.picked_up_qty then
      update public.items set quantity = greatest(0, quantity - (p - r.picked_up_qty)) where id = r.item_id;
    end if;
    done := p >= newq;
    update public.requests set picked_up_qty = p, quantity = newq, total_rs = newtotal, updated_at = now(),
      status = case when done then 'completed' else status end where id = _req;
  else
    rt := least(p, greatest(r.returned_qty, coalesce(_returned, r.returned_qty)));
    done := rt >= newq;
    update public.requests set picked_up_qty = p, returned_qty = rt, quantity = newq, total_rs = newtotal, updated_at = now(),
      status = case when done then 'completed' else status end where id = _req;
    if done then
      insert into public.messages (request_id, sender_id, body) values (_req, null, 'Everything is back. You can now rate each other.');
    elsif rt > r.returned_qty then
      insert into public.messages (request_id, sender_id, body) values (_req, null,
        'Owner confirmed ' || public.num_txt(rt) || ' of ' || public.num_txt(newq) || ' returned — ' || public.num_txt(newq - rt) || ' still due.');
    end if;
  end if;
  if p > r.picked_up_qty then
    insert into public.messages (request_id, sender_id, body) values (_req, null, 'Owner confirmed ' || public.num_txt(p) || ' handed over.');
  end if;
  if newq <> r.quantity then
    insert into public.messages (request_id, sender_id, body) values (_req, null,
      'Agreed change: ' || public.num_txt(newq) || ' instead of ' || public.num_txt(r.quantity) || '. New total: Rs ' || public.num_txt(newtotal) || '.');
  end if;
end $$;

-- old entry point: owner confirmation only now
create or replace function public.record_handover(_req uuid, _picked numeric, _returned numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.confirm_handover(_req, _picked, _returned, false);
end $$;

create or replace function public.report_payment(_req uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.total_rs <= 0 then raise exception 'This booking is free.'; end if;
  if r.status not in ('confirmed','completed') then raise exception 'This booking is not active.'; end if;
  if auth.uid() = r.owner_id then
    update public.requests set payment_status = 'confirmed_paid', payment_confirmed_by = auth.uid(), updated_at = now() where id = _req and payment_status <> 'confirmed_paid';
  else
    update public.requests set payment_status = 'reported_paid', payment_reported_by = auth.uid(), updated_at = now() where id = _req and payment_status = 'none';
  end if;
end $$;

create or replace function public.add_condition_photo(_req uuid, _path text, _stage text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if split_part(coalesce(_path, ''), '/', 1) <> auth.uid()::text then raise exception 'Not allowed'; end if;
  if _stage not in ('pickup','return') then raise exception 'Unknown step'; end if;
  if jsonb_array_length(r.condition_photos) >= 12 then raise exception 'You can add up to 12 photos.'; end if;
  if exists (select 1 from jsonb_array_elements(r.condition_photos) e where e->>'path' = _path) then return; end if;
  update public.requests set condition_photos = condition_photos || jsonb_build_array(jsonb_build_object('path', _path, 'by', auth.uid(), 'stage', _stage, 'at', now())),
    updated_at = now() where id = _req;
end $$;

-- ---------- change quantity after sending (borrower approved) ----------
create or replace function public.change_want_quantity(_want uuid, _qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare w public.wants; r record; covered numeric; excess numeric; newq numeric;
begin
  select * into w from public.wants where id = _want for update;
  if w.id is null or w.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if _qty is null or _qty <= 0 then raise exception 'Please choose how many you need.'; end if;
  select coalesce(sum(quantity), 0) into covered from public.requests where want_id = _want and status in ('requested','confirmed','completed');
  excess := covered - _qty;
  if excess > 0 then
    for r in
      select * from public.requests where want_id = _want and status in ('requested','confirmed') and picked_up_qty = 0
      order by case when status = 'requested' then 0 else 1 end, created_at desc
      for update
    loop
      exit when excess <= 0;
      if excess >= r.quantity then
        update public.requests set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = 'The borrower needs fewer now.', updated_at = now() where id = r.id;
        if r.status = 'confirmed' then
          insert into public.messages (request_id, sender_id, body) values (r.id, null, 'The borrower needs fewer now, so this booking was cancelled before pickup.');
        end if;
        excess := excess - r.quantity;
      else
        newq := r.quantity - excess;
        update public.requests set quantity = newq, total_rs = round(r.total_rs * newq / r.quantity), updated_at = now() where id = r.id;
        insert into public.messages (request_id, sender_id, body) values (r.id, null,
          'The borrower now needs ' || public.num_txt(newq) || ' instead of ' || public.num_txt(r.quantity) || '.');
        excess := 0;
      end if;
    end loop;
    if excess > 0 then raise exception 'Some items are already picked up, so you can''t go that low.'; end if;
  end if;
  update public.wants set quantity = _qty, pending_plan = null, updated_at = now() where id = _want;
end $$;

-- ---------- ratings: one per person per booking, can be edited for 7 days ----------
alter table public.ratings add column if not exists updated_at timestamptz;
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
    case when r.borrower_id = auth.uid() then nullif(_item_stars, 0) else null end, nullif(left(coalesce(_comment, ''), 500), ''))
  on conflict (request_id, rater_id) do update set person_stars = excluded.person_stars, item_stars = excluded.item_stars,
    comment = excluded.comment, updated_at = now()
  where ratings.created_at > now() - interval '7 days';
end $$;

-- ---------- reports: more kinds, under review, area + demo boundary ----------
alter table public.reports drop constraint reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('late','damage','missing','conduct','other'));
alter table public.reports drop constraint reports_status_check;
alter table public.reports add constraint reports_status_check check (status in ('open','replied','under_review','decided','appealed','closed'));

create or replace function public.can_admin_area(_area text, _reporter uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_area_role(auth.uid(), 'area_admin', _area) and public.is_demo_user(auth.uid()) = public.is_demo_user(_reporter)
$$;
revoke execute on function public.can_admin_area(text, uuid) from public, anon;
grant execute on function public.can_admin_area(text, uuid) to authenticated, service_role;

drop policy if exists "Parties and area admins read reports" on public.reports;
create policy "Parties and area admins read reports" on public.reports for select to authenticated
  using (reporter_id = auth.uid() or against_id = auth.uid() or public.can_admin_area(area, reporter_id));

create or replace function public.reply_report(_id uuid, _reply text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  update public.reports set reply = left(_reply, 1500), reply_at = now(), status = case when status = 'open' then 'replied' else status end
  where id = _id and against_id = auth.uid() and status in ('open','replied','under_review')
  returning * into rp;
  if rp.id is null then raise exception 'Not allowed'; end if;
  perform public.notify(rp.reporter_id, 'report', 'They replied to your report', 'Open the booking to read the reply.', rp.request_id, null, 'rep:' || rp.id || ':reply');
end $$;

create or replace function public.start_review(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  select * into rp from public.reports where id = _id for update;
  if rp.id is null or not public.can_admin_area(rp.area, rp.reporter_id) then raise exception 'Not allowed'; end if;
  if rp.status in ('open','replied') then
    update public.reports set status = 'under_review' where id = _id;
  end if;
end $$;

create or replace function public.decide_report(_id uuid, _decision text, _action text)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  select * into rp from public.reports where id = _id for update;
  if rp.id is null or not public.can_admin_area(rp.area, rp.reporter_id) then raise exception 'Not allowed'; end if;
  if rp.status not in ('open','replied','under_review') then return; end if; -- already decided (retry)
  if _action not in ('none','reminder','warning','restriction') then raise exception 'Unknown action'; end if;
  update public.reports set decision = left(_decision, 1500), decision_action = _action, decided_by = auth.uid(),
    decided_at = now(), status = 'decided' where id = _id;
  if _action = 'reminder' then
    insert into public.messages (request_id, sender_id, body) values (rp.request_id, null,
      'Reminder from your area admin: please sort out this booking soon.');
  elsif _action = 'restriction' then
    update public.profiles set restricted = true where id = rp.against_id;
  end if;
  perform public.notify(rp.reporter_id, 'report', 'Area admin decided', 'Open the booking to see the decision.', rp.request_id, null, 'rep:' || rp.id || ':decided');
  perform public.notify(rp.against_id, 'report', 'Area admin decided', 'Open the booking to see the decision.', rp.request_id, null, 'rep:' || rp.id || ':decided');
end $$;

create or replace function public.decide_appeal(_id uuid, _decision text, _lift boolean)
returns void language plpgsql security definer set search_path = public as $$
declare rp public.reports;
begin
  select * into rp from public.reports where id = _id for update;
  if rp.id is null or not public.can_admin_area(rp.area, rp.reporter_id) then raise exception 'Not allowed'; end if;
  if rp.status <> 'appealed' then raise exception 'There is no appeal to review.'; end if;
  update public.reports set appeal_decision = left(_decision, 1500), appeal_decided_at = now(), status = 'closed' where id = _id;
  if _lift then update public.profiles set restricted = false where id = rp.against_id; end if;
  perform public.notify(rp.reporter_id, 'report', 'Appeal decided', 'Open the booking to see the final decision.', rp.request_id, null, 'rep:' || rp.id || ':appeal');
  perform public.notify(rp.against_id, 'report', 'Appeal decided', 'Open the booking to see the final decision.', rp.request_id, null, 'rep:' || rp.id || ':appeal');
end $$;

create or replace function public.reports_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.against_id, 'report', 'A problem was reported', 'Open the booking to read it and reply.', new.request_id, null, 'rep:' || new.id || ':new');
  return new;
end $$;
drop trigger if exists reports_notify on public.reports;
create trigger reports_notify after insert on public.reports for each row execute function public.reports_notify();

create or replace function public.party_names(_ids uuid[])
returns table(id uuid, first_name text)
language sql stable security definer set search_path = public as $$
  select p.id, split_part(p.display_name, ' ', 1) from public.profiles p
  where p.id = any(_ids) and (p.id = auth.uid() or exists (
    select 1 from public.requests r where r.status in ('confirmed','completed')
      and ((r.borrower_id = auth.uid() and r.owner_id = p.id) or (r.owner_id = auth.uid() and r.borrower_id = p.id))
  ) or exists (select 1 from public.reports rp where (rp.reporter_id = p.id or rp.against_id = p.id) and public.can_admin_area(rp.area, rp.reporter_id)))
$$;

-- ---------- reminders, overdue items and expiry (run when someone opens their notifications) ----------
create or replace function public.refresh_my_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; today text := to_char(now() at time zone 'Asia/Karachi', 'YYYY-MM-DD');
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  update public.requests set status = 'expired', updated_at = now()
  where status = 'requested' and pickup_at < now() - interval '15 minutes';
  for r in select * from public.requests where status = 'confirmed' and (borrower_id = auth.uid() or owner_id = auth.uid()) loop
    if r.picked_up_qty = 0 and r.pickup_at between now() and now() + interval '24 hours' then
      perform public.notify(auth.uid(), 'reminder', 'Pickup soon', lower(r.item_name) || ': pickup ' || public.fmt_ts(r.pickup_at) || '.', r.id, null, 'req:' || r.id || ':pickup-soon');
    end if;
    if r.kind = 'return' and r.picked_up_qty > r.returned_qty then
      if r.return_at between now() and now() + interval '24 hours' then
        perform public.notify(auth.uid(), 'reminder', 'Return due soon', lower(r.item_name) || ': bring back by ' || public.fmt_ts(r.return_at) || '.', r.id, null, 'req:' || r.id || ':return-soon');
      elsif r.return_at < now() then
        perform public.notify(auth.uid(), 'overdue', 'Some items are still due',
          public.num_txt(r.picked_up_qty - r.returned_qty) || ' ' || lower(r.item_name) || ' should have been back by ' || public.fmt_ts(r.return_at) || '.',
          r.id, null, 'req:' || r.id || ':overdue:' || today);
      end if;
    end if;
  end loop;
end $$;

-- ---------- demo and real members never mix ----------
drop function if exists public.match_items(uuid, numeric);
create function public.match_items(_want uuid, _km numeric)
returns table(item_id uuid, item_name text, photo_path text, kind text, unit text,
  price_rs numeric, price_per numeric, distance_km numeric, owner_limit_km numeric, allow_outside boolean,
  free_qty numeric, time_note text, avg_rating numeric, rating_count int, text_score real,
  ai_summary text, needs_summary boolean, area_name text, specs text, description text,
  price_period text, min_amount numeric, step_amount numeric, condition text, accessories text)
language plpgsql stable security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare w public.wants; demo boolean;
begin
  select * into w from public.wants where id = _want;
  if w.id is null then raise exception 'Not found'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and auth.uid() is distinct from w.borrower_id then
    raise exception 'Not allowed';
  end if;
  demo := public.is_demo_user(w.borrower_id);
  return query
  select i.id, i.name, i.photo_path, i.kind, i.unit, i.price_rs, i.price_per,
    round(public.km_between(w.lat, w.lng, i.lat, i.lng)::numeric, 1),
    i.max_distance_km, i.allow_outside,
    public.item_free_qty(i.id, w.pickup_at, w.return_at),
    public.item_time_check(i, w.pickup_at, w.return_at),
    rt.avg_r, rt.cnt,
    greatest(similarity(lower(i.name), lower(coalesce(w.item_name, ''))),
             case when i.ai_keywords && w.ai_keywords then 1 else 0 end)::real,
    i.ai_summary, (i.ai_summary is null or i.summary_stale), i.area_name, i.specs, i.description,
    i.price_period, i.min_amount, i.step_amount, i.condition, i.accessories
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> w.borrower_id and not p.restricted
    and p.is_demo = demo
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

drop function if exists public.nearby_items(numeric);
create function public.nearby_items(_km numeric)
returns table(item_id uuid, item_name text, photo_path text, kind text, unit text,
  free_qty numeric, price_rs numeric, price_per numeric, distance_km numeric, avg_rating numeric, rating_count int, area_name text,
  price_period text, category text)
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
    rt.avg_r, rt.cnt, i.area_name, i.price_period, i.category
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.status = 'active' and i.owner_id <> me.id and not p.restricted
    and p.is_demo = me.is_demo
    and not public.is_blocked(i.owner_id, me.id)
    and public.km_between(me.lat, me.lng, i.lat, i.lng) <= least(_km, i.max_distance_km)
  order by 9
  limit 60;
end $$;
revoke execute on function public.nearby_items(numeric) from anon, public;
grant execute on function public.nearby_items(numeric) to authenticated;

-- One listing as a borrower sees it: area and rough distance only, never the owner or exact spot.
create or replace function public.listing_detail(_item uuid)
returns table(item_id uuid, item_name text, description text, specs text, category text, condition text, accessories text,
  kind text, unit text, price_rs numeric, price_per numeric, price_period text, min_amount numeric, step_amount numeric,
  measured boolean, area_name text, distance_km numeric, owner_limit_km numeric, allow_outside boolean,
  photo_paths text[], free_qty numeric, avg_rating numeric, rating_count int,
  avail_days int[], avail_start time, avail_end time)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not allowed'; end if;
  return query
  select i.id, i.name, i.description, i.specs, i.category, i.condition, i.accessories, i.kind, i.unit,
    i.price_rs, i.price_per, i.price_period, i.min_amount, i.step_amount, i.measured, i.area_name,
    round(public.km_between(me.lat, me.lng, i.lat, i.lng)::numeric, 1), i.max_distance_km, i.allow_outside,
    case when coalesce(array_length(i.photo_paths, 1), 0) > 0 then i.photo_paths when i.photo_path is not null then array[i.photo_path] else '{}'::text[] end,
    public.item_free_qty(i.id, now(), now() + interval '1 hour'), rt.avg_r, rt.cnt, i.avail_days, i.avail_start, i.avail_end
  from public.items i
  join public.profiles p on p.id = i.owner_id
  left join lateral (
    select round(avg(ra.item_stars)::numeric, 1) as avg_r, count(ra.item_stars)::int as cnt
    from public.ratings ra join public.requests rq on rq.id = ra.request_id
    where rq.item_id = i.id and ra.item_stars is not null
  ) rt on true
  where i.id = _item and i.status = 'active' and i.owner_id <> me.id and not p.restricted
    and p.is_demo = me.is_demo and not public.is_blocked(i.owner_id, me.id)
    and (public.km_between(me.lat, me.lng, i.lat, i.lng) <= i.max_distance_km or i.allow_outside);
end $$;
revoke execute on function public.listing_detail(uuid) from anon, public;
grant execute on function public.listing_detail(uuid) to authenticated;

-- Community impact from real completed records (demo and real counted separately).
create or replace function public.community_impact()
returns table(completed int, reusable_collected numeric, items_returned numeric, supplies_shared int, borrowers int, lenders int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where r.status = 'completed')::int,
    coalesce(sum(r.picked_up_qty) filter (where r.kind = 'return'), 0),
    coalesce(sum(r.returned_qty) filter (where r.kind = 'return'), 0),
    count(*) filter (where r.kind = 'use_up' and r.status = 'completed')::int,
    count(distinct r.borrower_id) filter (where r.status = 'completed')::int,
    count(distinct r.owner_id) filter (where r.status = 'completed')::int
  from public.requests r
  join public.profiles p on p.id = r.owner_id
  where p.is_demo = public.is_demo_user(auth.uid())
$$;

-- ---------- sending requests: recheck everything, including price ----------
create or replace function public.send_requests(_want uuid, _allocs jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  w public.wants; a jsonb; it public.items; q numeric; n int := 0; dist numeric;
  exc boolean; note_txt text; tn text; already numeric; me public.profiles; idx int; lbl text; total numeric; expected numeric;
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
    if exc then
      note_txt := left(regexp_replace(regexp_replace(coalesce(a->>'note', ''),
        '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[hidden]', 'g'),
        '\+?[0-9][0-9 -]{6,}[0-9]', '[hidden]', 'g'), 300);
    end if;
    select count(*) into idx from public.requests where want_id = _want;
    lbl := 'Owner ' || chr(65 + (idx % 26));
    insert into public.requests (want_id, item_id, borrower_id, owner_id, item_name, item_photo, unit, owner_name,
      borrower_name, kind, quantity, total_rs, pickup_at, return_at, is_exception, exception_status, note, agreed)
    values (_want, it.id, w.borrower_id, it.owner_id, it.name, it.photo_path, it.unit, lbl,
      null, it.kind, q, total,
      w.pickup_at, case when it.kind = 'return' then w.return_at else null end, exc, case when exc then 'pending' else null end, note_txt,
      jsonb_build_object('description', it.description, 'specs', it.specs, 'price_rs', it.price_rs,
        'price_per', it.price_per, 'price_period', it.price_period, 'unit', it.unit, 'kind', it.kind, 'area_name', it.area_name,
        'condition', it.condition, 'accessories', it.accessories, 'category', it.category, 'measured', it.measured));
    n := n + 1;
  end loop;

  update public.wants set status = 'active', pending_plan = null, updated_at = now() where id = _want;
  return n;
end $$;

-- ---------- access for new functions ----------
revoke execute on function public.notify(uuid, text, text, text, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.requests_notify() from public, anon, authenticated;
revoke execute on function public.wants_notify() from public, anon, authenticated;
revoke execute on function public.messages_notify() from public, anon, authenticated;
revoke execute on function public.reports_notify() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.mark_chat_read(uuid)', 'public.unread_counts()', 'public.mark_notifications_read(uuid[])',
    'public.propose_date_change(uuid, timestamptz, timestamptz, text)', 'public.answer_date_change(uuid, boolean)',
    'public.withdraw_date_change(uuid)', 'public.cancel_booking(uuid, text)', 'public.cancel_request(uuid)',
    'public.answer_exception(uuid, boolean)', 'public.respond_request(uuid, boolean)',
    'public.report_handover(uuid, numeric, numeric)', 'public.confirm_handover(uuid, numeric, numeric, boolean)',
    'public.record_handover(uuid, numeric, numeric)', 'public.report_payment(uuid)',
    'public.add_condition_photo(uuid, text, text)', 'public.change_want_quantity(uuid, numeric)',
    'public.rate_exchange(uuid, int, int, text)', 'public.reply_report(uuid, text)', 'public.start_review(uuid)',
    'public.decide_report(uuid, text, text)', 'public.decide_appeal(uuid, text, boolean)', 'public.party_names(uuid[])',
    'public.refresh_my_notifications()', 'public.community_impact()', 'public.send_requests(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;