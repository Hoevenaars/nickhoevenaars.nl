-- Recreate the public view with security_invoker so finance RLS stays in force.
-- The previous recreation dropped that option.

drop view if exists public.finance_recurring_transactions;

create view public.finance_recurring_transactions
  with (security_invoker = true)
as
select
  id,
  user_id,
  account_id,
  counterparty_account_id,
  category_id,
  entry_type,
  amount,
  description,
  note,
  frequency,
  interval_count,
  day_of_month,
  weekday,
  start_date,
  end_date,
  is_active,
  created_at,
  updated_at,
  date
from finance.recurring_transactions;

revoke all on public.finance_recurring_transactions from public, anon;
grant select, insert, update, delete on public.finance_recurring_transactions to authenticated, service_role;

notify pgrst, 'reload schema';
