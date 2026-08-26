-- Costs can be one-off or recurring monthly, like revenues.

alter table public.nh_costs
  add column if not exists cadence text not null default 'eenmalig';

alter table public.nh_costs
  drop constraint if exists nh_costs_cadence_check;

alter table public.nh_costs
  add constraint nh_costs_cadence_check
  check (cadence in ('eenmalig', 'maandelijks'));

comment on column public.nh_costs.cadence is
  'eenmalig = one-off cost; maandelijks = recurring monthly amount';
