-- Hides one word (e.g. the sender's first name) wherever it stands alone; letters only, so it is safe in a pattern.
CREATE OR REPLACE FUNCTION public.hide_word(_t text, _w text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$
  select case when char_length(coalesce(_w, '')) < 3 or _w !~ '^[[:alpha:]]+$' then _t
    else regexp_replace(_t, '(^|[^[:alnum:]])' || _w || '($|[^[:alnum:]])', '\1[hidden]\2', 'gi') end
$$;

CREATE OR REPLACE FUNCTION public.send_rich_message(_req uuid, _client_id uuid, _kind text, _preview uuid, _body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.requests; pv public.shayari_previews; me public.profiles; mid uuid; body_txt text; snap jsonb;
begin
  if _kind not in ('shayari','thanks') then raise exception 'Unknown message type.'; end if;
  if _client_id is null then raise exception 'Missing message id.'; end if;
  select * into r from public.requests where id = _req for update;
  if r.id is null or (r.borrower_id is distinct from auth.uid() and r.owner_id is distinct from auth.uid()) then
    raise exception 'Not allowed';
  end if;
  -- Retries (same tap, or a timeout after the message was already saved) get the saved message back.
  select id into mid from public.messages where request_id = _req and sender_id = auth.uid() and client_id = _client_id;
  if mid is not null then return mid; end if;
  if _preview is not null then
    select id into mid from public.messages where preview_id = _preview and request_id = _req and sender_id = auth.uid();
    if mid is not null then return mid; end if;
    if exists (select 1 from public.messages where preview_id = _preview) then
      raise exception 'This rhyme is not available. Please make it again.';
    end if;
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
end $function$;

-- Backstop for faraway notes sent without the app's preview step: the sender's first name is hidden too.
DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef('public.send_requests(uuid, jsonb)'::regprocedure) INTO def;
  def := replace(def,
    $r$note_txt := left(public.scrub_contact(coalesce(a->>'note', '')), 300);$r$,
    $r$note_txt := left(public.hide_word(public.scrub_contact(coalesce(a->>'note', '')), split_part(me.display_name, ' ', 1)), 300);$r$);
  IF position('hide_word' in def) = 0 THEN RAISE EXCEPTION 'send_requests note line not found'; END IF;
  EXECUTE def;
END $$;