-- The finance app sends both start_date and date when creating a
-- recurring item (vaste last). date was missing, so inserts failed.

alter table finance.recurring_transactions
  add column if not exists date date;

update finance.recurring_transactions
set date = start_date
where date is null and start_date is not null;

create or replace function finance.sync_recurring_date()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.start_date is not null then
    new.date := new.start_date;
  elsif new.date is not null then
    new.start_date := new.date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_recurring_date on finance.recurring_transactions;
create trigger trg_sync_recurring_date
before insert or update on finance.recurring_transactions
for each row
execute function finance.sync_recurring_date();

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
