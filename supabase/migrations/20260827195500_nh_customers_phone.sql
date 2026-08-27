-- Company phone on the customer itself, without a contact person.

alter table public.nh_customers
  add column if not exists phone text;
