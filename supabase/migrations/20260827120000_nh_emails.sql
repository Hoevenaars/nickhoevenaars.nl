-- Mailbox for nickhoevenaars.nl admin (send via Resend, receive via webhook).

create table if not exists public.nh_emails (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.nh_customers (id) on delete set null,
  contact_id uuid references public.nh_contacts (id) on delete set null,
  direction text not null check (direction in ('in', 'out')),
  from_email text not null,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text,
  text_body text,
  html_body text,
  resend_id text unique,
  message_id text,
  in_reply_to text,
  thread_id uuid references public.nh_emails (id) on delete set null,
  read_at timestamptz,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists nh_emails_sent_at_idx on public.nh_emails (sent_at desc);
create index if not exists nh_emails_customer_id_idx on public.nh_emails (customer_id, sent_at desc);
create index if not exists nh_emails_message_id_idx on public.nh_emails (message_id);
create index if not exists nh_emails_thread_id_idx on public.nh_emails (thread_id);
create index if not exists nh_emails_unread_idx on public.nh_emails (sent_at desc)
  where direction = 'in' and read_at is null;

alter table public.nh_emails enable row level security;
alter table public.nh_emails force row level security;
revoke all on table public.nh_emails from public, anon;
grant select, insert, update, delete on table public.nh_emails to authenticated;

drop policy if exists nh_emails_all on public.nh_emails;
create policy nh_emails_all on public.nh_emails
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
