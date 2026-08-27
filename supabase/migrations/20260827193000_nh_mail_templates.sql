-- Mail templates for nickhoevenaars.nl admin, used when composing mail.

create table if not exists public.nh_mail_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists nh_mail_templates_touch on public.nh_mail_templates;
create trigger nh_mail_templates_touch
before update on public.nh_mail_templates
for each row execute function nh_internal.touch_updated_at();

create index if not exists nh_mail_templates_name_idx on public.nh_mail_templates (name);

alter table public.nh_mail_templates enable row level security;
alter table public.nh_mail_templates force row level security;
revoke all on table public.nh_mail_templates from public, anon;
grant select, insert, update, delete on table public.nh_mail_templates to authenticated;

drop policy if exists nh_mail_templates_all on public.nh_mail_templates;
create policy nh_mail_templates_all on public.nh_mail_templates
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
