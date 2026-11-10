-- Contact details: +92 / spaces / dots / brackets / Urdu digits, emails, @handles and links.
-- Phone numbers need 9+ digits, so budgets ("Rs 3000 - 5000") and times ("1 se 6") are never hidden.
CREATE OR REPLACE FUNCTION public.western_digits(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ select translate(coalesce(_t, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789') $$;

CREATE OR REPLACE FUNCTION public.has_contact(_t text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select public.western_digits(_t) ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
      or public.western_digits(_t) ~ '\+?\(?[0-9]([[:space:].()-]{0,2}[0-9]){8,13}'
      or public.western_digits(_t) ~ '(^|[^A-Za-z0-9])@[A-Za-z0-9_.]{3,}'
      or public.western_digits(_t) ~* '(https?://|www\.)[^[:space:]]+'
$$;

CREATE OR REPLACE FUNCTION public.scrub_contact(_t text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(public.western_digits(_t),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[hidden]', 'g'),
    '(https?://|www\.)[^[:space:]]+', '[hidden]', 'gi'),
    '(^|[^A-Za-z0-9])@[A-Za-z0-9_.]{3,}', '\1[hidden]', 'g'),
    '\+?\(?[0-9]([[:space:].()-]{0,2}[0-9]){8,13}', '[hidden]', 'g')
$$;

CREATE OR REPLACE FUNCTION public.send_requests(_want uuid, _allocs jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w public.wants; a jsonb; it public.items; q numeric; n int := 0; dist numeric;
  exc boolean; note_txt text; tn text; already numeric; me public.profiles; idx int; lbl text; total numeric; expected numeric;
  pv public.shayari_previews; snap jsonb;
begin
  select * into w from public.wants where id = _want for update;
  if w.id is null or w.borrower_id is distinct from auth.uid() then raise exception 'Not allowed'; end if;
  if w.status in ('cancelled', 'done') then raise exception 'This search is closed, so nothing was sent.'; end if;
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
        if public.has_contact(pv.original) or public.has_contact(pv.meaning) or public.has_contact(pv.key_message)
           or public.has_contact(pv.lines[1]) or public.has_contact(pv.lines[2]) then
          raise exception 'This rhyme still has contact details. Please edit your message.';
        end if;
        note_txt := left(pv.original, 300);
        snap := jsonb_build_object('original', pv.original, 'key_message', pv.key_message, 'lines', to_jsonb(pv.lines),
          'meaning', pv.meaning, 'language', pv.language, 'tone', pv.tone, 'preview_id', pv.id);
      else
        note_txt := left(public.scrub_contact(coalesce(a->>'note', '')), 300);
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
end $function$;