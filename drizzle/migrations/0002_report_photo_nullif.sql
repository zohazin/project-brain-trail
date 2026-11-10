create or replace function public.create_report(_req uuid, _kind text, _description text, _photo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.requests; rid uuid; ar text;
begin
  select * into r from public.requests where id = _req;
  if r.id is null or not (r.borrower_id = auth.uid() or r.owner_id = auth.uid()) then raise exception 'Not allowed'; end if;
  if nullif(_photo, '') is not null and split_part(_photo, '/', 1) <> auth.uid()::text then raise exception 'Not allowed'; end if;
  select city into ar from public.items where id = r.item_id;
  insert into public.reports (request_id, reporter_id, against_id, area, kind, description, photo_path)
  values (_req, auth.uid(), case when r.borrower_id = auth.uid() then r.owner_id else r.borrower_id end,
    coalesce(ar, 'Multan'), _kind, left(_description, 1500), nullif(_photo, ''))
  returning id into rid;
  return rid;
end $$;

-- photo chosen for a booking must be the person's own file
create or replace function public.request_photos_check()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 1) <> new.user_id::text then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;
create trigger request_photos_check before insert or update on public.request_photos
for each row execute function public.request_photos_check();