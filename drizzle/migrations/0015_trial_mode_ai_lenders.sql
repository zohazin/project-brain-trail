-- Trial mode: a private trial (demo-world) account for a real member, a setting for simulated lender decisions/replies,
-- and one tracked AI reply per borrower message in chats with simulated demo lenders.

alter table public.profiles add column if not exists sim_auto boolean not null default true;
alter table public.profiles add column if not exists trial_of uuid;
create unique index if not exists profiles_trial_of_key on public.profiles(trial_of) where trial_of is not null;
grant update (sim_auto) on public.profiles to authenticated;

create table public.demo_replies (
  message_id uuid primary key references public.messages(id) on delete cascade,
  request_id uuid not null references public.requests(id) on delete cascade,
  borrower_id uuid not null,
  status text not null default 'running' check (status in ('running', 'ready', 'failed')),
  reply_id uuid references public.messages(id) on delete set null,
  wants_change boolean not null default false,
  error text,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index demo_replies_request_idx on public.demo_replies(request_id);
grant select on public.demo_replies to authenticated;
grant all on public.demo_replies to service_role;
alter table public.demo_replies enable row level security;
create policy "Borrower reads own demo replies" on public.demo_replies
  for select to authenticated using (borrower_id = auth.uid());
