-- ================= Phase 4 =================

-- ---------- privacy: members change only their own everyday profile details ----------
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_path, test_cnic, city, area_name, lat, lng, travel_km, onboarded, updated_at)
  on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;

-- listings: members can't mark their own listing as demo or move it to someone else
create or replace function public.items_keep_flags()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_demo := false;
    else
      new.is_demo := old.is_demo;
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists items_keep_flags on public.items;
create trigger items_keep_flags before insert or update on public.items for each row execute function public.items_keep_flags();

-- ---------- quotes: the exact price breakdown is saved on every booking ----------
create or replace function public.charge_days(_from timestamptz, _to timestamptz)
returns int language sql immutable set search_path = public as $$
  select greatest(1, ceil(extract(epoch from (coalesce(_to, _from) - _from)) / 86400.0))::int
$$;

create or replace function public.quote_json(_kind text, _price numeric, _per numeric, _period text, _unit text, _qty numeric,
  _from timestamptz, _to timestamptz)
returns jsonb language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'quantity', _qty, 'unit', _unit, 'kind', _kind,
    'unit_rate', coalesce(_price, 0), 'price_per', coalesce(nullif(_per, 0), 1), 'period', coalesce(_period, 'each'),
    'days', case when _kind = 'return' and coalesce(_period, 'each') = 'day' then public.charge_days(_from, _to) else null end,
    'pickup_at', _from, 'return_at', case when _kind = 'return' then _to else null end,
    'extra_rs', 0,
    'total', public.price_for(_kind, _price, _per, coalesce(_period, 'each'), _qty, _from, _to))
$$;

create or replace function public.agreed_with_quote(_a jsonb, _kind text, _unit text, _qty numeric, _from timestamptz, _to timestamptz, _total numeric)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(_a, '{}'::jsonb) || jsonb_build_object('quote',
    public.quote_json(_kind, (_a->>'price_rs')::numeric, (_a->>'price_per')::numeric, coalesce(_a->>'price_period', 'each'), _unit, _qty, _from, _to)
    || jsonb_build_object('total', _total))
$$;

create or replace function public.requests_quote()
returns trigger language plpgsql set search_path = public as $$
begin
  new.agreed := public.agreed_with_quote(new.agreed, new.kind, new.unit, new.quantity, new.pickup_at, new.return_at, new.total_rs);
  return new;
end $$;
drop trigger if exists requests_quote on public.requests;
create trigger requests_quote before insert on public.requests for each row execute function public.requests_quote();

-- ---------- request terms version and handover history ----------
alter table public.requests add column if not exists terms_version int not null default 1;
alter table public.requests add column if not exists handover_log jsonb not null default '[]';

drop function if exists public.respond_request(uuid, boolean);
create function public.respond_request(_req uuid, _accept boolean, _version int default null)
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
  if _accept and _version is not null and _version <> r.terms_version then
    raise exception 'The borrower changed this request. Please check the new details and answer again.';
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

-- ---------- changes to accepted bookings need the other person's yes ----------
alter table public.date_changes add column if not exists new_quantity numeric;
alter table public.date_changes add column if not exists old_quantity numeric;
alter table public.date_changes add column if not exists old_pickup_at timestamptz;
alter table public.date_changes add column if not exists old_return_at timestamptz;
alter table public.date_changes add column if not exists old_total numeric;
alter table public.date_changes add column if not exists new_total numeric;
alter table public.date_changes add column if not exists expires_at timestamptz;
alter table public.date_changes drop constraint if exists date_changes_status_check;
alter table public.date_changes add constraint date_changes_status_check
  check (status in ('pending','accepted','declined','withdrawn','expired'));

create or replace function public.booking_change_check(r public.requests, _pickup timestamptz, _return timestamptz, _qty numeric)
returns text language plpgsql stable security definer set search_path = public as $$
declare it public.items; tn text; need numeric;
begin
  if _qty is null or _qty <= 0 then return 'Please choose how many.'; end if;
  if _qty < r.picked_up_qty then return 'You can''t go below the ' || public.num_txt(r.picked_up_qty) || ' already handed over.'; end if;
  if r.kind = 'return' and (_return is null or _return <= _pickup) then return 'The return time must be after pickup.'; end if;
  if r.picked_up_qty > 0 and _pickup is distinct from r.pickup_at then return 'The items are already picked up. You can only change the return time.'; end if;
  if r.picked_up_qty = 0 and _pickup is distinct from r.pickup_at and _pickup < now() - interval '15 minutes' then return 'That pickup time has passed.'; end if;
  select * into it from public.items where id = r.item_id;
  if _pickup is distinct from r.pickup_at or _return is distinct from r.return_at then
    tn := public.item_time_check(it, _pickup, case when r.kind = 'return' then _return else null end);
    if tn is not null then return tn; end if;
  end if;
  need := case when r.kind = 'use_up' then _qty - r.picked_up_qty else _qty - r.returned_qty end;
  if need > 0 and public.item_free_qty(r.item_id, _pickup, case when r.kind = 'return' then _return else null end, r.id) < need then
    if _qty > r.quantity and _pickup = r.pickup_at and _return is not distinct from r.return_at then
      return 'The owner doesn''t have that many free at these times.';
    end if;
    return 'That time clashes with another booking for this item.';
  end if;
  return null;
end $$;
revoke execute on function public.booking_change_check(public.requests, timestamptz, timestamptz, numeric) from public, anon, authenticated;

create or replace function public.propose_booking_change(_req uuid, _pickup timestamptz, _return timestamptz, _qty numeric, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; msg text; dc uuid; nq numeric; np timestamptz; nr timestamptz; nt numeric; a jsonb;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'Only accepted bookings can be changed this way.'; end if;
  if public.is_blocked(r.owner_id, r.borrower_id) then
    raise exception 'You can''t change this booking with this person. Finish the return or ask your area admin for help.';
  end if;
  nq := coalesce(_qty, r.quantity);
  np := coalesce(_pickup, r.pickup_at);
  nr := case when r.kind = 'return' then coalesce(_return, r.return_at) else null end;
  if nq = r.quantity and np = r.pickup_at and nr is not distinct from r.return_at then raise exception 'Nothing would change.'; end if;
  select id into dc from public.date_changes where request_id = _req and status = 'pending' and proposed_by = auth.uid()
    and new_pickup_at = np and new_return_at is not distinct from nr and coalesce(new_quantity, r.quantity) = nq;
  if dc is not null then return dc; end if; -- same proposal again (retry)
  if exists (select 1 from public.date_changes where request_id = _req and status = 'pending') then
    raise exception 'A change is already waiting for an answer.';
  end if;
  msg := public.booking_change_check(r, np, nr, nq);
  if msg is not null then raise exception '%', msg; end if;
  a := coalesce(r.agreed, '{}'::jsonb);
  nt := case when a ? 'price_rs'
    then public.price_for(r.kind, (a->>'price_rs')::numeric, (a->>'price_per')::numeric, coalesce(a->>'price_period', 'each'), nq, np, nr)
    else case when r.quantity > 0 then round(r.total_rs * nq / r.quantity) else r.total_rs end end;
  insert into public.date_changes (request_id, proposed_by, new_pickup_at, new_return_at, new_quantity, old_quantity,
    old_pickup_at, old_return_at, old_total, new_total, note, expires_at)
  values (_req, auth.uid(), np, nr, nq, r.quantity, r.pickup_at, r.return_at, r.total_rs, nt,
    nullif(left(coalesce(_note, ''), 300), ''),
    case when r.picked_up_qty = 0 then least(now() + interval '48 hours', greatest(r.pickup_at, now() + interval '1 hour'))
      else now() + interval '48 hours' end)
  returning id into dc;
  perform public.notify(case when auth.uid() = r.owner_id then r.borrower_id else r.owner_id end, 'date_change', 'Change to a booking proposed',
    case when nq <> r.quantity then public.num_txt(nq) || ' instead of ' || public.num_txt(r.quantity) || ' ' || lower(r.item_name) || '. ' else '' end
    || case when np <> r.pickup_at or nr is distinct from r.return_at
         then 'New dates: pickup ' || public.fmt_ts(np) || coalesce(', back ' || public.fmt_ts(nr), '') || '. ' else '' end
    || 'The current agreement stays until you answer.', r.id, null, 'dc:' || dc);
  return dc;
end $$;

create or replace function public.propose_date_change(_req uuid, _pickup timestamptz, _return timestamptz, _note text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.propose_booking_change(_req, _pickup, _return, null, _note);
end $$;

drop function if exists public.answer_date_change(uuid, boolean);
create function public.answer_date_change(_id uuid, _accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare d public.date_changes; r public.requests; msg text; nq numeric; nt numeric; a jsonb; done boolean; body text;
begin
  select * into d from public.date_changes where id = _id for update;
  if d.id is null then raise exception 'Not found'; end if;
  select * into r from public.requests where id = d.request_id for update;
  if not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if d.proposed_by = auth.uid() then raise exception 'The other person needs to answer this.'; end if;
  if d.status <> 'pending' then return d.status; end if; -- already answered (retry)
  if d.expires_at is not null and d.expires_at < now() then
    update public.date_changes set status = 'expired', decided_at = now() where id = _id;
    perform public.notify(d.proposed_by, 'date_change', 'Change expired', 'No answer in time. The current agreement stays.', r.id, null, 'dc:' || d.id || ':answer');
    return 'expired';
  end if;
  if not _accept then
    update public.date_changes set status = 'declined', decided_at = now() where id = _id;
    perform public.notify(d.proposed_by, 'date_change', 'Change declined', 'The current agreement stays.', r.id, null, 'dc:' || d.id || ':answer');
    return 'declined';
  end if;
  if r.status <> 'confirmed' then raise exception 'This booking is no longer active.'; end if;
  perform 1 from public.items where id = r.item_id for update;
  nq := coalesce(d.new_quantity, r.quantity);
  msg := public.booking_change_check(r, d.new_pickup_at, d.new_return_at, nq);
  if msg is not null then raise exception '% The current agreement stays.', msg; end if;
  a := coalesce(r.agreed, '{}'::jsonb);
  nt := case when a ? 'price_rs'
    then public.price_for(r.kind, (a->>'price_rs')::numeric, (a->>'price_per')::numeric, coalesce(a->>'price_period', 'each'), nq, d.new_pickup_at, d.new_return_at)
    else case when r.quantity > 0 then round(r.total_rs * nq / r.quantity) else r.total_rs end end;
  done := case when r.kind = 'use_up' then r.picked_up_qty >= nq else r.picked_up_qty >= nq and r.returned_qty >= nq end;
  update public.requests set quantity = nq, pickup_at = d.new_pickup_at,
    return_at = case when r.kind = 'return' then d.new_return_at else null end,
    total_rs = nt, terms_version = terms_version + 1,
    agreed = public.agreed_with_quote(a, r.kind, r.unit, nq, d.new_pickup_at, d.new_return_at, nt) || jsonb_build_object('changed_at', now()),
    status = case when done then 'completed' else status end,
    updated_at = now()
  where id = r.id;
  update public.date_changes set status = 'accepted', decided_at = now() where id = _id;
  body := 'Change agreed:'
    || case when nq <> r.quantity then ' ' || public.num_txt(nq) || ' instead of ' || public.num_txt(r.quantity) || '.' else '' end
    || case when d.new_pickup_at <> r.pickup_at or d.new_return_at is distinct from r.return_at
         then ' Pickup ' || public.fmt_ts(d.new_pickup_at) || coalesce(', bring back ' || public.fmt_ts(d.new_return_at), '') || '.' else '' end
    || case when nt <> r.total_rs then ' New total: ' || case when nt = 0 then 'Free' else 'Rs ' || public.num_txt(nt) end || '.' else '' end;
  insert into public.messages (request_id, sender_id, body) values (r.id, null, body);
  perform public.notify(d.proposed_by, 'date_change', 'Change accepted', body, r.id, null, 'dc:' || d.id || ':answer');
  return 'accepted';
end $$;

-- borrower needs a different amount after sending: unanswered requests change now, accepted bookings are asked
drop function if exists public.change_want_quantity(uuid, numeric);
create function public.change_want_quantity(_want uuid, _qty numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare w public.wants; r record; covered numeric; excess numeric; newq numeric; nt numeric;
  changed int := 0; asked int := 0; cancelled int := 0;
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
        -- not needed at all: cancelling before pickup is always allowed
        update public.requests set status = 'cancelled', cancelled_by = auth.uid(), cancel_reason = 'The borrower needs fewer now.', updated_at = now() where id = r.id;
        update public.date_changes set status = 'withdrawn', decided_at = now() where request_id = r.id and status = 'pending';
        if r.status = 'confirmed' then
          insert into public.messages (request_id, sender_id, body) values (r.id, null, 'The borrower needs fewer now, so this booking was cancelled before pickup.');
        end if;
        excess := excess - r.quantity;
        cancelled := cancelled + 1;
      elsif r.status = 'requested' then
        -- not answered yet: change it now; an owner can't accept the old amount any more
        newq := r.quantity - excess;
        nt := case when r.agreed ? 'price_rs'
          then public.price_for(r.kind, (r.agreed->>'price_rs')::numeric, (r.agreed->>'price_per')::numeric, coalesce(r.agreed->>'price_period', 'each'), newq, r.pickup_at, r.return_at)
          else round(r.total_rs * newq / r.quantity) end;
        update public.requests set quantity = newq, total_rs = nt, terms_version = terms_version + 1,
          agreed = public.agreed_with_quote(r.agreed, r.kind, r.unit, newq, r.pickup_at, r.return_at, nt),
          updated_at = now() where id = r.id;
        perform public.notify(r.owner_id, 'request', 'Request changed',
          'The borrower now needs ' || public.num_txt(newq) || ' instead of ' || public.num_txt(r.quantity) || ' ' || lower(r.item_name) || '. Please check before you answer.',
          r.id, null, 'req:' || r.id || ':v' || (r.terms_version + 1));
        excess := 0;
        changed := changed + 1;
      else
        -- accepted booking: the owner has to agree to the smaller amount
        newq := r.quantity - excess;
        update public.date_changes set status = 'withdrawn', decided_at = now() where request_id = r.id and status = 'pending' and proposed_by = auth.uid();
        if exists (select 1 from public.date_changes where request_id = r.id and status = 'pending') then
          raise exception '% has proposed a change to this booking. Please answer it first.', r.owner_name;
        end if;
        perform public.propose_booking_change(r.id, null, null, newq, 'The borrower needs fewer now.');
        excess := 0;
        asked := asked + 1;
      end if;
    end loop;
    if excess > 0 then raise exception 'Some items are already picked up, so you can''t go that low.'; end if;
  end if;
  update public.wants set quantity = _qty, pending_plan = null, updated_at = now() where id = _want;
  return jsonb_build_object('changed', changed, 'asked', asked, 'cancelled', cancelled);
end $$;

-- ---------- pickups and returns: impossible numbers are refused, every step is recorded ----------
create or replace function public.report_handover(_req uuid, _picked numeric, _returned numeric)
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; p numeric; b numeric; who text; log jsonb := '[]'::jsonb;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active, so nothing can be recorded.'; end if;
  if coalesce(_picked, 0) < 0 or coalesce(_returned, 0) < 0 then raise exception 'Amounts can''t be below zero.'; end if;
  if coalesce(_picked, 0) > r.quantity then raise exception 'You can''t collect more than the % agreed.', public.num_txt(r.quantity); end if;
  if r.kind = 'use_up' and coalesce(_returned, 0) > 0 then raise exception 'Supplies are used up, so there is nothing to return.'; end if;
  p := greatest(r.borrower_picked_qty, coalesce(_picked, 0));
  if coalesce(_returned, 0) > greatest(p, r.picked_up_qty) then raise exception 'You can''t return more than you collected.'; end if;
  b := greatest(r.borrower_returned_qty, coalesce(_returned, 0));
  if p = r.borrower_picked_qty and b = r.borrower_returned_qty then return; end if; -- nothing new (retry)
  if p > r.borrower_picked_qty then
    log := log || jsonb_build_array(jsonb_build_object('step', 'pickup', 'action', 'reported', 'qty', p, 'by', auth.uid(), 'role', 'borrower', 'at', now()));
  end if;
  if b > r.borrower_returned_qty then
    log := log || jsonb_build_array(jsonb_build_object('step', 'return', 'action', 'reported', 'qty', b, 'by', auth.uid(), 'role', 'borrower', 'at', now()));
  end if;
  update public.requests set borrower_picked_qty = p, borrower_returned_qty = b, handover_log = handover_log || log, updated_at = now() where id = _req;
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
declare r public.requests; p numeric; rt numeric; done boolean; log jsonb := '[]'::jsonb;
begin
  select * into r from public.requests where id = _req for update;
  if r.id is null or r.owner_id is distinct from auth.uid() then raise exception 'Only the owner can confirm what was handed over or received.'; end if;
  if r.status <> 'confirmed' then raise exception 'This booking is not active, so nothing can be confirmed.'; end if;
  if coalesce(_picked, 0) < 0 or coalesce(_returned, 0) < 0 then raise exception 'Amounts can''t be below zero.'; end if;
  if _picked is not null and _picked > r.quantity then raise exception 'You can''t hand over more than the % agreed.', public.num_txt(r.quantity); end if;
  if _picked is not null and _picked < r.picked_up_qty then
    raise exception 'You already confirmed % handed over. That number can''t go down.', public.num_txt(r.picked_up_qty);
  end if;
  p := coalesce(_picked, r.picked_up_qty);
  if p > r.picked_up_qty then
    log := log || jsonb_build_array(jsonb_build_object('step', 'pickup', 'action', 'confirmed', 'qty', p, 'by', auth.uid(), 'role', 'owner', 'at', now()));
  end if;
  if r.kind = 'use_up' then
    if coalesce(_returned, 0) > 0 then raise exception 'Supplies are used up, so there is nothing to return.'; end if;
    if p > r.picked_up_qty then
      update public.items set quantity = greatest(0, quantity - (p - r.picked_up_qty)) where id = r.item_id;
    end if;
    done := p >= r.quantity;
    update public.requests set picked_up_qty = p, handover_log = handover_log || log, updated_at = now(),
      status = case when done then 'completed' else status end where id = _req;
  else
    if _returned is not null and _returned > p then
      raise exception 'You can''t receive back more than was handed over (%).', public.num_txt(p);
    end if;
    if _returned is not null and _returned < r.returned_qty then
      raise exception 'You already confirmed % back. That number can''t go down.', public.num_txt(r.returned_qty);
    end if;
    rt := coalesce(_returned, r.returned_qty);
    if rt > r.returned_qty then
      log := log || jsonb_build_array(jsonb_build_object('step', 'return', 'action', 'confirmed', 'qty', rt, 'by', auth.uid(), 'role', 'owner', 'at', now()));
    end if;
    -- complete only when everything agreed was handed over and has come back
    done := p >= r.quantity and rt >= r.quantity;
    update public.requests set picked_up_qty = p, returned_qty = rt, handover_log = handover_log || log, updated_at = now(),
      status = case when done then 'completed' else status end where id = _req;
    if done then
      insert into public.messages (request_id, sender_id, body) values (_req, null, 'Everything is back. You can now rate each other.');
    elsif rt > r.returned_qty then
      insert into public.messages (request_id, sender_id, body) values (_req, null,
        'Owner confirmed ' || public.num_txt(rt) || ' of ' || public.num_txt(p) || ' returned — ' || public.num_txt(p - rt) || ' still due.');
    end if;
  end if;
  if p > r.picked_up_qty then
    insert into public.messages (request_id, sender_id, body) values (_req, null, 'Owner confirmed ' || public.num_txt(p) || ' handed over.');
  end if;
  if coalesce(_close_pickup, false) and p > 0 and p < r.quantity and not public.is_blocked(r.owner_id, r.borrower_id)
     and not exists (select 1 from public.date_changes where request_id = _req and status = 'pending') then
    -- the rest won't be picked up: the borrower agrees to the smaller booking (and its price) first
    perform public.propose_booking_change(_req, null, null, p,
      'Only ' || public.num_txt(p) || ' were handed over. The rest won''t be picked up.');
  end if;
end $$;

-- ---------- availability for exact dates (same rules as matching) ----------
drop function if exists public.nearby_items(numeric);
create function public.nearby_items(_km numeric, _from timestamptz default null, _to timestamptz default null)
returns table(item_id uuid, item_name text, photo_path text, kind text, unit text,
  listed_qty numeric, free_qty numeric, time_note text, price_rs numeric, price_per numeric, distance_km numeric,
  avg_rating numeric, rating_count int, area_name text, price_period text, category text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not allowed'; end if;
  return query
  select i.id, i.name, i.photo_path, i.kind, i.unit, i.quantity,
    case when _from is null then null else public.item_free_qty(i.id, _from, case when i.kind = 'return' then _to else null end) end,
    case when _from is null then null else public.item_time_check(i, _from, case when i.kind = 'return' then _to else null end) end,
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
  order by 11
  limit 60;
end $$;
revoke execute on function public.nearby_items(numeric, timestamptz, timestamptz) from anon, public;
grant execute on function public.nearby_items(numeric, timestamptz, timestamptz) to authenticated, service_role;

drop function if exists public.listing_detail(uuid);
create function public.listing_detail(_item uuid, _from timestamptz default null, _to timestamptz default null)
returns table(item_id uuid, item_name text, description text, specs text, category text, condition text, accessories text,
  kind text, unit text, price_rs numeric, price_per numeric, price_period text, min_amount numeric, step_amount numeric,
  measured boolean, area_name text, distance_km numeric, owner_limit_km numeric, allow_outside boolean,
  photo_paths text[], listed_qty numeric, free_qty numeric, time_note text, avg_rating numeric, rating_count int,
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
    i.quantity,
    case when _from is null then null else public.item_free_qty(i.id, _from, case when i.kind = 'return' then _to else null end) end,
    case when _from is null then null else public.item_time_check(i, _from, case when i.kind = 'return' then _to else null end) end,
    rt.avg_r, rt.cnt, i.avail_days, i.avail_start, i.avail_end
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
revoke execute on function public.listing_detail(uuid, timestamptz, timestamptz) from anon, public;
grant execute on function public.listing_detail(uuid, timestamptz, timestamptz) to authenticated, service_role;

-- quote for asking for one listing directly (same checks as sending)
create or replace function public.quote_item(_item uuid, _qty numeric, _from timestamptz, _to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; it public.items; dist numeric; free numeric; tn text; problem text; ret timestamptz;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Not allowed'; end if;
  select * into it from public.items where id = _item and status = 'active';
  if it.id is null or it.owner_id = me.id or public.is_demo_user(it.owner_id) is distinct from me.is_demo
     or public.is_blocked(it.owner_id, me.id) then
    raise exception 'This listing isn''t available to you.';
  end if;
  dist := round(public.km_between(me.lat, me.lng, it.lat, it.lng)::numeric, 1);
  if dist > it.max_distance_km and not it.allow_outside then raise exception 'This listing isn''t available to you.'; end if;
  ret := case when it.kind = 'return' then _to else null end;
  if _from is null then problem := 'Choose when you will pick it up.';
  elsif it.kind = 'return' and (_to is null or _to <= _from) then problem := 'The return time must be after pickup.';
  elsif _from < now() - interval '15 minutes' then problem := 'That pickup time has passed.';
  elsif _qty is null or _qty <= 0 then problem := 'Choose how many you need.';
  end if;
  if problem is null then
    tn := public.item_time_check(it, _from, ret);
    free := public.item_free_qty(it.id, _from, ret);
    if tn is not null then problem := tn;
    elsif free < _qty then problem := 'Only ' || public.num_txt(greatest(free, 0)) || ' free for these times.';
    elsif it.kind = 'use_up' and it.min_amount is not null and _qty < it.min_amount then
      problem := 'The smallest amount is ' || public.num_txt(it.min_amount) || ' ' || it.unit || '.';
    elsif it.kind = 'use_up' and it.step_amount is not null and mod(_qty, it.step_amount) <> 0 then
      problem := 'It comes in steps of ' || public.num_txt(it.step_amount) || ' ' || it.unit || '.';
    end if;
  end if;
  return public.quote_json(it.kind, it.price_rs, it.price_per, it.price_period, it.unit, coalesce(_qty, 0), _from, ret)
    || jsonb_build_object('free_qty', free, 'listed_qty', it.quantity, 'problem', problem, 'distance_km', dist,
      'exception', dist > it.max_distance_km, 'item_name', it.name);
end $$;
revoke execute on function public.quote_item(uuid, numeric, timestamptz, timestamptz) from anon, public;
grant execute on function public.quote_item(uuid, numeric, timestamptz, timestamptz) to authenticated, service_role;

-- ---------- background work: expiry, reminders and overdue items for everyone ----------
create or replace function public.process_due_events()
returns int language plpgsql security definer set search_path = public as $$
declare r public.requests; d public.date_changes; n int := 0;
  today text := to_char(now() at time zone 'Asia/Karachi', 'YYYY-MM-DD');
begin
  update public.requests set status = 'expired', updated_at = now()
  where status = 'requested' and pickup_at < now() - interval '15 minutes';
  get diagnostics n = row_count;
  for d in update public.date_changes set status = 'expired', decided_at = now()
    where status = 'pending' and expires_at is not null and expires_at < now() returning * loop
    perform public.notify(d.proposed_by, 'date_change', 'Change expired', 'No answer in time. The current agreement stays.', d.request_id, null, 'dc:' || d.id || ':answer');
  end loop;
  for r in select * from public.requests where status = 'confirmed' loop
    if r.picked_up_qty = 0 and r.pickup_at between now() and now() + interval '24 hours' then
      perform public.notify(r.borrower_id, 'reminder', 'Pickup soon', lower(r.item_name) || ': pickup ' || public.fmt_ts(r.pickup_at) || '.', r.id, null, 'req:' || r.id || ':pickup-soon');
      perform public.notify(r.owner_id, 'reminder', 'Pickup soon', lower(r.item_name) || ': pickup ' || public.fmt_ts(r.pickup_at) || '.', r.id, null, 'req:' || r.id || ':pickup-soon');
    end if;
    if r.kind = 'return' and r.picked_up_qty > r.returned_qty then
      if r.return_at between now() and now() + interval '24 hours' then
        perform public.notify(r.borrower_id, 'reminder', 'Return due soon', lower(r.item_name) || ': bring back by ' || public.fmt_ts(r.return_at) || '.', r.id, null, 'req:' || r.id || ':return-soon');
        perform public.notify(r.owner_id, 'reminder', 'Items due back soon', lower(r.item_name) || ': due back by ' || public.fmt_ts(r.return_at) || '.', r.id, null, 'req:' || r.id || ':return-soon');
      elsif r.return_at < now() then
        perform public.notify(r.borrower_id, 'overdue', 'Some items are still due',
          public.num_txt(r.picked_up_qty - r.returned_qty) || ' ' || lower(r.item_name) || ' should have been back by ' || public.fmt_ts(r.return_at) || '.',
          r.id, null, 'req:' || r.id || ':overdue:' || today);
        perform public.notify(r.owner_id, 'overdue', 'Items are late',
          public.num_txt(r.picked_up_qty - r.returned_qty) || ' ' || lower(r.item_name) || ' should have been back by ' || public.fmt_ts(r.return_at) || '.',
          r.id, null, 'req:' || r.id || ':overdue:' || today);
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.process_due_events() from public, anon, authenticated;
grant execute on function public.process_due_events() to service_role;

-- opening the app still catches up right away (same keys, so no duplicates)
create or replace function public.refresh_my_notifications()
returns void language plpgsql security definer set search_path = public as $$
declare r public.requests; d public.date_changes; today text := to_char(now() at time zone 'Asia/Karachi', 'YYYY-MM-DD');
begin
  if auth.uid() is null then raise exception 'Not allowed'; end if;
  update public.requests set status = 'expired', updated_at = now()
  where status = 'requested' and pickup_at < now() - interval '15 minutes' and (borrower_id = auth.uid() or owner_id = auth.uid());
  for d in update public.date_changes dc set status = 'expired', decided_at = now()
    where dc.status = 'pending' and dc.expires_at is not null and dc.expires_at < now() and public.is_party(dc.request_id) returning dc.* loop
    perform public.notify(d.proposed_by, 'date_change', 'Change expired', 'No answer in time. The current agreement stays.', d.request_id, null, 'dc:' || d.id || ':answer');
  end loop;
  for r in select * from public.requests where status = 'confirmed' and (borrower_id = auth.uid() or owner_id = auth.uid()) loop
    if r.picked_up_qty = 0 and r.pickup_at between now() and now() + interval '24 hours' then
      perform public.notify(auth.uid(), 'reminder', 'Pickup soon', lower(r.item_name) || ': pickup ' || public.fmt_ts(r.pickup_at) || '.', r.id, null, 'req:' || r.id || ':pickup-soon');
    end if;
    if r.kind = 'return' and r.picked_up_qty > r.returned_qty then
      if r.return_at between now() and now() + interval '24 hours' then
        perform public.notify(auth.uid(), 'reminder', case when auth.uid() = r.owner_id then 'Items due back soon' else 'Return due soon' end,
          lower(r.item_name) || ': ' || case when auth.uid() = r.owner_id then 'due back' else 'bring back' end || ' by ' || public.fmt_ts(r.return_at) || '.', r.id, null, 'req:' || r.id || ':return-soon');
      elsif r.return_at < now() then
        perform public.notify(auth.uid(), 'overdue', case when auth.uid() = r.owner_id then 'Items are late' else 'Some items are still due' end,
          public.num_txt(r.picked_up_qty - r.returned_qty) || ' ' || lower(r.item_name) || ' should have been back by ' || public.fmt_ts(r.return_at) || '.',
          r.id, null, 'req:' || r.id || ':overdue:' || today);
      end if;
    end if;
  end loop;
end $$;

-- ---------- access for new and replaced functions ----------
do $$
declare f text;
begin
  foreach f in array array[
    'public.respond_request(uuid, boolean, int)', 'public.propose_booking_change(uuid, timestamptz, timestamptz, numeric, text)',
    'public.propose_date_change(uuid, timestamptz, timestamptz, text)', 'public.answer_date_change(uuid, boolean)',
    'public.change_want_quantity(uuid, numeric)', 'public.report_handover(uuid, numeric, numeric)',
    'public.confirm_handover(uuid, numeric, numeric, boolean)', 'public.refresh_my_notifications()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
revoke execute on function public.items_keep_flags() from public, anon, authenticated;
revoke execute on function public.requests_quote() from public, anon, authenticated;