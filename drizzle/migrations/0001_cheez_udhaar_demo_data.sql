-- Storage: each person can only touch files in their own folder. Other people see photos only through short-lived signed links made on the server after a permission check.
create policy "Own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Demo accounts (clearly labelled, password: CheezDemo2026) ----------
do $$
declare
  u record;
begin
  for u in select * from (values
    ('d0000000-0000-4000-8000-000000000001'::uuid, 'ali.demo@cheezudhaar.test',   'Ali (Demo borrower)'),
    ('d0000000-0000-4000-8000-000000000002'::uuid, 'bilal.demo@cheezudhaar.test', 'Bilal (Demo owner)'),
    ('d0000000-0000-4000-8000-000000000003'::uuid, 'sara.demo@cheezudhaar.test',  'Sara (Demo owner)'),
    ('d0000000-0000-4000-8000-000000000004'::uuid, 'usman.demo@cheezudhaar.test', 'Usman (Demo owner)'),
    ('d0000000-0000-4000-8000-000000000005'::uuid, 'hina.demo@cheezudhaar.test',  'Hina (Demo owner)'),
    ('d0000000-0000-4000-8000-000000000006'::uuid, 'farah.demo@cheezudhaar.test', 'Farah (Demo owner)'),
    ('d0000000-0000-4000-8000-000000000007'::uuid, 'admin.demo@cheezudhaar.test', 'Zainab (Demo area admin)')
  ) as t(id, email, name)
  loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('CheezDemo2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', u.name), now(), now(),
      '', '', '', '', '', '', '', '', false, false)
    on conflict (id) do nothing;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now())
    on conflict do nothing;
  end loop;
end $$;

-- Profiles: all in Multan around Gulgasht Colony. Distances from Ali: Bilal 0.8 km, Sara 1.0 km, Usman 1.6 km, Hina 2.6 km, Farah 6 km.
update public.profiles p set
  test_cnic = '00000-0000000-0', onboarded = true, is_demo = true, city = 'Multan',
  area_name = v.area, lat = v.lat, lng = v.lng, travel_km = v.km
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'Gulgasht Colony', 30.2100::float8, 71.4750::float8, 5::numeric),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'Gulgasht Colony', 30.2172, 71.4750, 5),
  ('d0000000-0000-4000-8000-000000000003'::uuid, 'Gulgasht Colony', 30.2190, 71.4750, 5),
  ('d0000000-0000-4000-8000-000000000004'::uuid, 'Officers Colony', 30.2244, 71.4750, 5),
  ('d0000000-0000-4000-8000-000000000005'::uuid, 'Model Town',      30.1866, 71.4750, 5),
  ('d0000000-0000-4000-8000-000000000006'::uuid, 'Bosan Road',      30.2640, 71.4750, 5),
  ('d0000000-0000-4000-8000-000000000007'::uuid, 'Gulgasht Colony', 30.2100, 71.4760, 5)
) as v(id, area, lat, lng, km)
where p.id = v.id;

insert into public.user_roles (user_id, role, area)
values ('d0000000-0000-4000-8000-000000000007', 'area_admin', 'Multan')
on conflict do nothing;

-- Demo items. AI summaries are created by the server the first time they are searched.
insert into public.items (id, owner_id, name, description, specs, kind, quantity, unit, price_rs, price_per,
  avail_start, avail_end, area_name, lat, lng, max_distance_km, allow_outside, is_demo)
values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', 'Folding chairs',
   'Plastic folding chairs, white. Good for events. I need them back by 4 PM.', 'Plastic, foldable', 'return', 20, 'item', 0, 1,
   '09:00', '16:00', 'Gulgasht Colony', 30.2172, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000003', 'Folding chairs',
   'Steel folding chairs with padded seat.', 'Steel frame, padded', 'return', 12, 'item', 0, 1,
   '08:00', '21:00', 'Gulgasht Colony', 30.2190, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004', 'Folding chairs',
   'Black plastic folding chairs.', 'Plastic', 'return', 8, 'item', 0, 1,
   '08:00', '21:00', 'Officers Colony', 30.2244, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005', 'Folding chairs',
   'Wooden folding chairs, sturdy.', 'Wood', 'return', 8, 'item', 0, 1,
   '08:00', '21:00', 'Model Town', 30.1866, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-000000000005', 'Craft glue',
   'White craft glue for school projects and paper work.', 'PVA glue', 'use_up', 200, 'ml', 15, 5,
   '08:00', '21:00', 'Model Town', 30.1866, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-000000000002', 'Projector',
   'Epson projector with HDMI cable. Good for presentations and movie nights.', '3000 lumens, HDMI', 'return', 1, 'item', 500, 1,
   '09:00', '16:00', 'Gulgasht Colony', 30.2172, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000007', 'd0000000-0000-4000-8000-000000000003', 'Electric drill',
   'Bosch electric drill with a set of bits.', '500W', 'return', 1, 'item', 0, 1,
   '08:00', '21:00', 'Gulgasht Colony', 30.2190, 71.4750, 5, false, true),
  ('e0000000-0000-4000-8000-000000000008', 'd0000000-0000-4000-8000-000000000006', 'Camping tent',
   'Four person camping tent, waterproof.', '4 person', 'return', 1, 'item', 300, 1,
   '08:00', '21:00', 'Bosan Road', 30.2640, 71.4750, 3, true, true),
  ('e0000000-0000-4000-8000-000000000009', 'd0000000-0000-4000-8000-000000000006', 'Wall paint (white)',
   'Leftover white wall paint, emulsion.', 'Emulsion', 'use_up', 4000, 'ml', 0, 1,
   '08:00', '21:00', 'Bosan Road', 30.2640, 71.4750, 10, false, true)
on conflict (id) do nothing;