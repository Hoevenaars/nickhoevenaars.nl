-- Compacte admin voor nickhoevenaars.nl, in het bestaande Fluweel-project.
-- Tabellen zijn nh_*-prefixed in public zodat ze niet botsen met Fluweel-CRM.
-- Toegang: alleen authenticated users in nh_admins (RLS). Anon heeft geen grants.

create schema if not exists nh_internal;
revoke all on schema nh_internal from public;
grant usage on schema nh_internal to authenticated;

create table if not exists public.nh_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function nh_internal.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nh_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function nh_internal.is_admin() from public, anon;
grant execute on function nh_internal.is_admin() to authenticated;

create or replace function nh_internal.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.nh_customers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  status text not null default 'prospect'
    check (status in ('prospect', 'actief', 'inactief', 'verloren')),
  website text,
  address text,
  extra_notes text,
  price_arrangement text,
  discount text,
  billing_type text check (billing_type is null or billing_type in ('vast', 'uurtarief', 'anders')),
  billing_frequency text,
  payment_terms text,
  billing_email text,
  billing_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nh_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_contact_logs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  contact_id uuid references public.nh_contacts (id) on delete set null,
  occurred_at timestamptz not null default now(),
  type text not null
    check (type in ('telefoon', 'email', 'meeting', 'whatsapp', 'bezoek', 'overig')),
  summary text not null,
  outcome text,
  follow_up text,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_todos (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete cascade,
  title text not null,
  due_at date,
  priority text not null default 'normaal'
    check (priority in ('laag', 'normaal', 'hoog')),
  status text not null default 'open'
    check (status in ('open', 'done')),
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.nh_opportunities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  contact_id uuid references public.nh_contacts (id) on delete set null,
  title text not null,
  phase text not null default 'nieuw'
    check (phase in ('nieuw', 'contact', 'kennismaking', 'voorstel', 'follow-up', 'akkoord', 'verloren', 'onhold')),
  potential_value numeric,
  value_period text,
  expected_at date,
  next_action text,
  next_action_at date,
  notes text,
  is_upsell boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nh_ideas (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  title text not null,
  body text,
  converted_todo_id uuid references public.nh_todos (id) on delete set null,
  converted_opportunity_id uuid references public.nh_opportunities (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete cascade,
  related_type text
    check (related_type is null or related_type in ('contact_log', 'todo', 'opportunity', 'standalone')),
  related_id uuid,
  remind_at date not null,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

drop trigger if exists nh_customers_touch on public.nh_customers;
create trigger nh_customers_touch
before update on public.nh_customers
for each row execute function nh_internal.touch_updated_at();

drop trigger if exists nh_opportunities_touch on public.nh_opportunities;
create trigger nh_opportunities_touch
before update on public.nh_opportunities
for each row execute function nh_internal.touch_updated_at();

create index if not exists nh_contacts_customer_id_idx on public.nh_contacts (customer_id);
create index if not exists nh_contact_logs_customer_id_idx on public.nh_contact_logs (customer_id, occurred_at desc);
create index if not exists nh_todos_customer_id_idx on public.nh_todos (customer_id);
create index if not exists nh_todos_open_due_idx on public.nh_todos (due_at) where status = 'open';
create index if not exists nh_opportunities_customer_id_idx on public.nh_opportunities (customer_id);
create index if not exists nh_opportunities_phase_idx on public.nh_opportunities (phase);
create index if not exists nh_ideas_customer_id_idx on public.nh_ideas (customer_id);
create index if not exists nh_notes_customer_id_idx on public.nh_notes (customer_id, created_at desc);
create index if not exists nh_reminders_remind_at_idx on public.nh_reminders (remind_at) where done = false;
create index if not exists nh_customers_company_name_idx on public.nh_customers (company_name);

do $$
declare
  t text;
begin
  foreach t in array array[
    'nh_admins','nh_customers','nh_contacts','nh_contact_logs','nh_todos',
    'nh_opportunities','nh_ideas','nh_notes','nh_reminders'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists nh_admins_all on public.nh_admins;
create policy nh_admins_all on public.nh_admins
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_customers_all on public.nh_customers;
create policy nh_customers_all on public.nh_customers
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_contacts_all on public.nh_contacts;
create policy nh_contacts_all on public.nh_contacts
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_contact_logs_all on public.nh_contact_logs;
create policy nh_contact_logs_all on public.nh_contact_logs
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_todos_all on public.nh_todos;
create policy nh_todos_all on public.nh_todos
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_opportunities_all on public.nh_opportunities;
create policy nh_opportunities_all on public.nh_opportunities
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_ideas_all on public.nh_ideas;
create policy nh_ideas_all on public.nh_ideas
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_notes_all on public.nh_notes;
create policy nh_notes_all on public.nh_notes
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_reminders_all on public.nh_reminders;
create policy nh_reminders_all on public.nh_reminders
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

insert into public.nh_admins (user_id, email)
values ('b5538381-bcba-4759-897f-7f5136f47eb1', 'nhoevenaars@gmail.com')
on conflict (user_id) do nothing;
