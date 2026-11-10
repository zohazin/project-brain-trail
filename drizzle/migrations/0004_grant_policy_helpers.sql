grant execute on function public.is_party(uuid) to authenticated, service_role;
grant execute on function public.chat_open(uuid) to authenticated, service_role;
grant execute on function public.has_area_role(uuid, public.app_role, text) to authenticated, service_role;
grant execute on function public.item_ratings(uuid[]) to authenticated, service_role;
grant execute on function public.party_names(uuid[]) to authenticated, service_role;
grant execute on function public.match_items(uuid, numeric) to authenticated, service_role;
grant execute on function public.item_free_qty(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;