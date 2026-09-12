-- Website Refresh V1
-- Standalone schema. Do not run against Fluweel.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

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

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.app_settings (
  id int primary key default 1 check (id = 1),
  max_pages_per_scan int not null default 10,
  desktop_viewport_width int not null default 1440,
  desktop_viewport_height int not null default 900,
  mobile_viewport_width int not null default 390,
  mobile_viewport_height int not null default 844,
  scan_timeout_ms int not null default 120000,
  retry_count int not null default 2,
  weight_mobile int not null default 10,
  weight_conversion int not null default 10,
  weight_visual int not null default 5,
  weight_technical int not null default 5,
  weight_content int not null default 5,
  max_pages_product_fit int not null default 50,
  allow_booking boolean not null default true,
  allow_multilingual boolean not null default true,
  allow_webshop boolean not null default false,
  ai_model text not null default 'gpt-4.1-mini',
  ai_enabled boolean not null default true,
  max_scan_cost_usd numeric(10, 4) not null default 1.50,
  needs_review_score_min int not null default 75,
  needs_review_score_max int not null default 85,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

insert into public.app_settings (id) values (1);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_name text,
  domain text not null,
  website_url text not null,
  industry text,
  industry_confidence numeric(4, 3),
  city text,
  country text,
  company_size_estimate text,
  company_size_confidence numeric(4, 3),
  source_type text not null default 'manual',
  source_reference text,
  status text not null default 'NEW',
  website_score numeric(5, 2),
  commercial_fit_score numeric(5, 2),
  product_fit_score numeric(5, 2),
  complexity_score numeric(5, 2),
  opportunity_score numeric(5, 2),
  contact_eligibility_status text,
  manual_priority boolean not null default false,
  assigned_to uuid references public.profiles (id) on delete set null,
  last_scan_at timestamptz,
  next_scan_at timestamptz,
  is_archived boolean not null default false,
  archive_reason text,
  reject_reason text,
  needs_review boolean not null default false,
  needs_review_reasons text[] not null default '{}',
  ai_recommendation text,
  notes text,
  constraint prospects_status_check check (status in (
    'NEW', 'VALIDATING', 'SCANNING', 'SCAN_FAILED', 'ANALYSING',
    'QUALIFIED', 'WATCHLIST', 'SALES_READY', 'PRIORITY', 'REJECTED',
    'PREVIEW_READY', 'ARCHIVED'
  )),
  constraint prospects_source_type_check check (source_type in (
    'manual', 'browser_extension', 'import', 'automatic_discovery', 'referral'
  )),
  constraint prospects_reject_reason_check check (
    reject_reason is null or reject_reason in (
      'complex_website', 'webshop', 'large_enterprise', 'central_franchise_site',
      'recent_modern_site', 'low_commercial_value', 'insufficient_information',
      'website_unreachable', 'duplicate', 'unsupported_language',
      'poor_product_fit', 'manual_rejection'
    )
  )
);

create unique index prospects_active_domain_idx
  on public.prospects (lower(domain))
  where is_archived = false;

create index prospects_status_idx on public.prospects (status);
create index prospects_opportunity_score_idx on public.prospects (opportunity_score desc nulls last);
create index prospects_industry_idx on public.prospects (industry);
create index prospects_source_type_idx on public.prospects (source_type);
create index prospects_last_scan_at_idx on public.prospects (last_scan_at desc);
create index prospects_needs_review_idx on public.prospects (needs_review) where needs_review = true;
create index prospects_assigned_to_idx on public.prospects (assigned_to);

create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function private.set_updated_at();

create table public.prospect_sources (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  source_type text not null,
  source_url text,
  source_name text,
  discovered_at timestamptz not null default now(),
  added_by uuid references public.profiles (id) on delete set null,
  notes text,
  constraint prospect_sources_type_check check (source_type in (
    'manual', 'browser_extension', 'import', 'automatic_discovery', 'referral'
  ))
);

create index prospect_sources_prospect_id_idx on public.prospect_sources (prospect_id);

create table public.website_scans (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  pages_requested int not null default 0,
  pages_scanned int not null default 0,
  desktop_screenshot_count int not null default 0,
  mobile_screenshot_count int not null default 0,
  lighthouse_performance numeric(5, 2),
  lighthouse_accessibility numeric(5, 2),
  lighthouse_best_practices numeric(5, 2),
  lighthouse_seo numeric(5, 2),
  broken_links_count int not null default 0,
  forms_count int not null default 0,
  forms_working_count int not null default 0,
  http_status int,
  ssl_valid boolean,
  scan_cost numeric(10, 4) not null default 0,
  scan_duration_ms int,
  error_code text,
  error_message text,
  error_type text,
  retryable boolean,
  retry_count int not null default 0,
  scanner_version text not null default '1.0.0',
  constraint website_scans_status_check check (status in (
    'queued', 'running', 'completed', 'failed', 'partial'
  ))
);

create index website_scans_prospect_id_idx on public.website_scans (prospect_id, started_at desc);
create index website_scans_status_idx on public.website_scans (status);

create table public.scanned_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.website_scans (id) on delete cascade,
  url text not null,
  page_type text not null default 'other',
  title text,
  meta_description text,
  http_status int,
  word_count int not null default 0,
  has_form boolean not null default false,
  has_phone boolean not null default false,
  has_email boolean not null default false,
  has_primary_cta boolean not null default false,
  desktop_screenshot_url text,
  mobile_screenshot_url text,
  raw_text_reference text,
  extracted_text text,
  created_at timestamptz not null default now(),
  constraint scanned_pages_page_type_check check (page_type in (
    'home', 'about', 'services', 'contact', 'team', 'pricing', 'projects', 'other'
  ))
);

create index scanned_pages_scan_id_idx on public.scanned_pages (scan_id);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  scan_id uuid references public.website_scans (id) on delete set null,
  page_id uuid references public.scanned_pages (id) on delete set null,
  category text not null,
  finding_type text not null,
  title text not null,
  description text not null,
  severity text not null,
  confidence numeric(4, 3) not null default 0.5,
  evidence_type text,
  evidence_reference text,
  commercial_relevance text,
  created_by text not null default 'workflow',
  created_at timestamptz not null default now(),
  constraint findings_category_check check (category in (
    'technical', 'mobile', 'conversion', 'visual', 'content', 'trust',
    'navigation', 'seo', 'performance', 'accessibility', 'complexity', 'commercial'
  )),
  constraint findings_type_check check (finding_type in ('FACT', 'OBSERVATION', 'HYPOTHESIS')),
  constraint findings_severity_check check (severity in ('critical', 'important', 'minor')),
  constraint findings_created_by_check check (created_by in ('system', 'agent', 'human', 'workflow'))
);

create index findings_prospect_id_idx on public.findings (prospect_id);
create index findings_scan_id_idx on public.findings (scan_id);
create index findings_category_idx on public.findings (category);
create index findings_type_idx on public.findings (finding_type);

create table public.prospect_scores (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  scan_id uuid references public.website_scans (id) on delete set null,
  technical_score numeric(5, 2) not null,
  mobile_score numeric(5, 2) not null,
  conversion_score numeric(5, 2) not null,
  visual_score numeric(5, 2) not null,
  content_score numeric(5, 2) not null,
  commercial_fit_score numeric(5, 2) not null,
  product_fit_score numeric(5, 2) not null,
  complexity_score numeric(5, 2) not null,
  opportunity_score numeric(5, 2) not null,
  website_improvement_potential numeric(5, 2) not null,
  evidence_quality_score numeric(5, 2) not null,
  website_score numeric(5, 2) not null,
  score_version text not null,
  calculated_at timestamptz not null default now(),
  breakdown jsonb not null default '{}'::jsonb
);

create index prospect_scores_prospect_id_idx on public.prospect_scores (prospect_id, calculated_at desc);
create index prospect_scores_scan_id_idx on public.prospect_scores (scan_id);

create table public.product_fit_checks (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  scan_id uuid references public.website_scans (id) on delete set null,
  has_webshop boolean not null default false,
  has_login boolean not null default false,
  has_booking_system boolean not null default false,
  has_customer_portal boolean not null default false,
  has_complex_integrations boolean not null default false,
  has_multiple_languages boolean not null default false,
  has_large_content_volume boolean not null default false,
  has_multiple_locations boolean not null default false,
  has_custom_calculator boolean not null default false,
  estimated_page_count int,
  standard_product_fit boolean not null,
  fit_reason text not null,
  complexity_score numeric(5, 2) not null,
  created_at timestamptz not null default now()
);

create index product_fit_checks_prospect_id_idx on public.product_fit_checks (prospect_id);
create index product_fit_checks_scan_id_idx on public.product_fit_checks (scan_id);

create table public.manual_reviews (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  scan_id uuid references public.website_scans (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  ai_recommendation text,
  human_decision text not null,
  score_accuracy int,
  website_assessment_accuracy int,
  commercial_fit_accuracy int,
  product_fit_accuracy int,
  notes text,
  created_at timestamptz not null default now(),
  constraint manual_reviews_decision_check check (human_decision in (
    'reject', 'watchlist', 'sales_ready', 'priority', 'rescan'
  ))
);

create index manual_reviews_prospect_id_idx on public.manual_reviews (prospect_id, created_at desc);
create index manual_reviews_reviewer_id_idx on public.manual_reviews (reviewer_id);

create table public.previews (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects (id) on delete cascade,
  status text not null default 'queued',
  design_profile text not null,
  template_version text not null default 'v1',
  content_version text not null default 'v1',
  preview_url text,
  generated_at timestamptz,
  expires_at timestamptz,
  generation_cost numeric(10, 4) not null default 0,
  qa_status text,
  qa_score numeric(5, 2),
  approved_for_internal_use boolean not null default false,
  content jsonb not null default '{}'::jsonb,
  constraint previews_status_check check (status in (
    'queued', 'generating', 'ready', 'failed', 'expired'
  )),
  constraint previews_design_profile_check check (design_profile in (
    'modern', 'warm', 'premium'
  ))
);

create index previews_prospect_id_idx on public.previews (prospect_id, generated_at desc);

create table public.cost_events (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete set null,
  scan_id uuid references public.website_scans (id) on delete set null,
  cost_type text not null,
  provider text,
  amount numeric(12, 6) not null,
  currency text not null default 'USD',
  tokens_input int,
  tokens_output int,
  created_at timestamptz not null default now(),
  constraint cost_events_type_check check (cost_type in (
    'ai', 'browser', 'hosting', 'data', 'preview', 'other'
  ))
);

create index cost_events_prospect_id_idx on public.cost_events (prospect_id, created_at desc);
create index cost_events_scan_id_idx on public.cost_events (scan_id);
create index cost_events_type_idx on public.cost_events (cost_type);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid references public.prospects (id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  old_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint activity_logs_actor_type_check check (actor_type in (
    'system', 'agent', 'human', 'workflow'
  ))
);

create index activity_logs_prospect_id_idx on public.activity_logs (prospect_id, created_at desc);
create index activity_logs_event_type_idx on public.activity_logs (event_type);
create index findings_page_id_idx on public.findings (page_id);
create index manual_reviews_scan_id_idx on public.manual_reviews (scan_id);
create index prospect_sources_added_by_idx on public.prospect_sources (added_by);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'scan-screenshots',
    'scan-screenshots',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']::text[]
  ),
  (
    'preview-assets',
    'preview-assets',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp', 'text/html']::text[]
  )
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.prospects enable row level security;
alter table public.prospect_sources enable row level security;
alter table public.website_scans enable row level security;
alter table public.scanned_pages enable row level security;
alter table public.findings enable row level security;
alter table public.prospect_scores enable row level security;
alter table public.product_fit_checks enable row level security;
alter table public.manual_reviews enable row level security;
alter table public.previews enable row level security;
alter table public.cost_events enable row level security;
alter table public.activity_logs enable row level security;

create policy "staff_all_profiles" on public.profiles
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_app_settings" on public.app_settings
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_prospects" on public.prospects
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_prospect_sources" on public.prospect_sources
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_website_scans" on public.website_scans
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_scanned_pages" on public.scanned_pages
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_findings" on public.findings
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_prospect_scores" on public.prospect_scores
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_product_fit_checks" on public.product_fit_checks
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_manual_reviews" on public.manual_reviews
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_previews" on public.previews
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_cost_events" on public.cost_events
  for all to authenticated
  using (true) with check (true);

create policy "staff_all_activity_logs" on public.activity_logs
  for all to authenticated
  using (true) with check (true);

create policy "staff_read_scan_screenshots" on storage.objects
  for select to authenticated
  using (bucket_id in ('scan-screenshots', 'preview-assets'));

create policy "staff_insert_scan_screenshots" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('scan-screenshots', 'preview-assets'));

create policy "staff_update_scan_screenshots" on storage.objects
  for update to authenticated
  using (bucket_id in ('scan-screenshots', 'preview-assets'))
  with check (bucket_id in ('scan-screenshots', 'preview-assets'));

create policy "staff_delete_scan_screenshots" on storage.objects
  for delete to authenticated
  using (bucket_id in ('scan-screenshots', 'preview-assets'));
