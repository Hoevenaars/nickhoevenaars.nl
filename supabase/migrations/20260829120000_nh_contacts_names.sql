-- Split contact names for informal (Hi voornaam) and formal (Beste heer/mevrouw achternaam) mail.

alter table public.nh_contacts
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists gender text;

alter table public.nh_contacts
  drop constraint if exists nh_contacts_gender_check;
alter table public.nh_contacts
  add constraint nh_contacts_gender_check
  check (gender is null or gender in ('heer', 'mevrouw'));

update public.nh_contacts
set
  first_name = nullif(trim(split_part(trim(name), ' ', 1)), ''),
  last_name = nullif(trim(substr(trim(name), char_length(split_part(trim(name), ' ', 1)) + 1)), '')
where coalesce(first_name, '') = '';

update public.nh_contacts
set first_name = nullif(trim(name), '')
where coalesce(first_name, '') = '';

update public.nh_contacts
set first_name = 'Contact'
where coalesce(first_name, '') = '';

alter table public.nh_contacts
  alter column first_name set not null;
