-- Quotes, costs (spread or unlinked) and revenues for the compact admin.

create table if not exists public.nh_quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete set null,
  contact_id uuid references public.nh_contacts (id) on delete set null,
  title text not null,
  amount numeric,
  status text not null default 'concept'
    check (status in ('concept', 'verstuurd', 'geaccepteerd', 'afgewezen')),
  issued_at date not null default current_date,
  valid_until date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_costs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric not null,
  incurred_at date not null default current_date,
  category text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  cost_id uuid not null references public.nh_costs (id) on delete cascade,
  customer_id uuid not null references public.nh_customers (id) on delete cascade,
  amount numeric not null,
  unique (cost_id, customer_id)
);

create table if not exists public.nh_revenues (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete set null,
  quote_id uuid references public.nh_quotes (id) on delete set null,
  title text not null,
  amount numeric not null,
  received_at date not null default current_date,
  kind text not null default 'eenmalig'
    check (kind in ('eenmalig', 'maandelijks', 'offerte', 'overig')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists nh_quotes_customer_id_idx on public.nh_quotes (customer_id);
create index if not exists nh_cost_allocations_cost_id_idx on public.nh_cost_allocations (cost_id);
create index if not exists nh_cost_allocations_customer_id_idx on public.nh_cost_allocations (customer_id);
create index if not exists nh_revenues_customer_id_idx on public.nh_revenues (customer_id);
create index if not exists nh_revenues_received_at_idx on public.nh_revenues (received_at desc);
create index if not exists nh_costs_incurred_at_idx on public.nh_costs (incurred_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['nh_quotes', 'nh_costs', 'nh_cost_allocations', 'nh_revenues']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists nh_quotes_all on public.nh_quotes;
create policy nh_quotes_all on public.nh_quotes
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_costs_all on public.nh_costs;
create policy nh_costs_all on public.nh_costs
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_cost_allocations_all on public.nh_cost_allocations;
create policy nh_cost_allocations_all on public.nh_cost_allocations
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_revenues_all on public.nh_revenues;
create policy nh_revenues_all on public.nh_revenues
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
