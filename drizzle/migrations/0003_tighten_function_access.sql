alter function public.km_between(double precision, double precision, double precision, double precision) set search_path = public;
alter function public.fmt_time(time) set search_path = public;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Trigger-only functions: nobody calls these directly.
revoke execute on function public.handle_new_user() from authenticated;