-- Loose admin settings (mail footer first; more keys later).

create table if not exists public.nh_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists nh_settings_touch on public.nh_settings;
create trigger nh_settings_touch
before update on public.nh_settings
for each row execute function nh_internal.touch_updated_at();

alter table public.nh_settings enable row level security;
alter table public.nh_settings force row level security;
revoke all on table public.nh_settings from public, anon;
grant select, insert, update, delete on table public.nh_settings to authenticated;

drop policy if exists nh_settings_all on public.nh_settings;
create policy nh_settings_all on public.nh_settings
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
