-- Planner-style board: buckets (columns), labels, comments, extra task fields.
-- No preset categories: Nick adds columns and labels himself.

create table if not exists public.nh_todo_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.nh_todo_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default 'pink',
  created_at timestamptz not null default now()
);

create table if not exists public.nh_todo_label_links (
  todo_id uuid not null references public.nh_todos (id) on delete cascade,
  label_id uuid not null references public.nh_todo_labels (id) on delete cascade,
  primary key (todo_id, label_id)
);

create table if not exists public.nh_todo_comments (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.nh_todos (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.nh_todos
  add column if not exists bucket_id uuid references public.nh_todo_buckets (id) on delete set null,
  add column if not exists start_at date,
  add column if not exists sort_order integer not null default 0,
  add column if not exists checklist jsonb not null default '[]'::jsonb,
  add column if not exists progress text not null default 'niet_gestart',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'nh_todos_progress_check'
  ) then
    alter table public.nh_todos
      add constraint nh_todos_progress_check
      check (progress in ('niet_gestart', 'bezig', 'voltooid'));
  end if;
end $$;

update public.nh_todos
set progress = 'voltooid'
where status = 'done' and progress is distinct from 'voltooid';

drop trigger if exists nh_todos_touch on public.nh_todos;
create trigger nh_todos_touch
before update on public.nh_todos
for each row execute function nh_internal.touch_updated_at();

create index if not exists nh_todos_bucket_id_idx
  on public.nh_todos (bucket_id, sort_order);

create index if not exists nh_todo_comments_todo_id_idx
  on public.nh_todo_comments (todo_id, created_at);

create index if not exists nh_todo_buckets_position_idx
  on public.nh_todo_buckets (position);

do $$
declare
  t text;
begin
  foreach t in array array[
    'nh_todo_buckets', 'nh_todo_labels', 'nh_todo_label_links', 'nh_todo_comments'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists nh_todo_buckets_all on public.nh_todo_buckets;
create policy nh_todo_buckets_all on public.nh_todo_buckets
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_todo_labels_all on public.nh_todo_labels;
create policy nh_todo_labels_all on public.nh_todo_labels
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_todo_label_links_all on public.nh_todo_label_links;
create policy nh_todo_label_links_all on public.nh_todo_label_links
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));

drop policy if exists nh_todo_comments_all on public.nh_todo_comments;
create policy nh_todo_comments_all on public.nh_todo_comments
  for all to authenticated
  using ((select nh_internal.is_admin()))
  with check ((select nh_internal.is_admin()));
