create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create index if not exists findings_page_id_idx on public.findings (page_id);
create index if not exists manual_reviews_scan_id_idx on public.manual_reviews (scan_id);
create index if not exists prospect_sources_added_by_idx on public.prospect_sources (added_by);
