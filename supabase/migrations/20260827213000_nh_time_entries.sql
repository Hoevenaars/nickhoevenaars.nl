-- Start/stop time tracking per customer and activity type.

create table if not exists public.nh_time_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete set null,
  type text not null
    check (type in ('telefoon', 'mail', 'ontwikkelen', 'afspraak')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds integer,
  note text,
  contact_log_id uuid references public.nh_contact_logs (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists nh_time_entries_one_running
  on public.nh_time_entries ((true))
  where ended_at is null;

create index if not exists nh_time_entries_started_at_idx
  on public.nh_time_entries (started_at desc);

create index if not exists nh_time_entries_customer_id_idx
  on public.nh_time_entries (customer_id, started_at desc);

alter table public.nh_time_entries enable row level security;
alter table public.nh_time_entries force row level security;
revoke all on table public.nh_time_entries from public, anon;
grant select, insert, update, delete on table public.nh_time_entries to authenticated;

drop policy if exists nh_time_entries_all on public.nh_time_entries;
create policy nh_time_entries_all on public.nh_time_entries
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
