-- PDF bij offertes en als mailbijlage. Bestanden staan in private bucket nh-pdfs.

alter table public.nh_quotes
  add column if not exists pdf_path text,
  add column if not exists pdf_name text;

alter table public.nh_emails
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nh-pdfs', 'nh-pdfs', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists nh_pdfs_select on storage.objects;
create policy nh_pdfs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'nh-pdfs' and (select nh_internal.is_admin()));

drop policy if exists nh_pdfs_insert on storage.objects;
create policy nh_pdfs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'nh-pdfs' and (select nh_internal.is_admin()));

drop policy if exists nh_pdfs_update on storage.objects;
create policy nh_pdfs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'nh-pdfs' and (select nh_internal.is_admin()))
  with check (bucket_id = 'nh-pdfs' and (select nh_internal.is_admin()));

drop policy if exists nh_pdfs_delete on storage.objects;
create policy nh_pdfs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'nh-pdfs' and (select nh_internal.is_admin()));
