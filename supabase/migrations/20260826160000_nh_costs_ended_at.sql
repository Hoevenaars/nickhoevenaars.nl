-- Monthly costs can stop so they drop out of the current monthly total.

alter table public.nh_costs
  add column if not exists ended_at date;

comment on column public.nh_costs.ended_at is
  'For monthly costs: last day the cost still applies; null means still running';
