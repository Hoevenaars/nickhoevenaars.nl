-- Seed the Planner columns in screenshot order and fold existing buckets onto them.
-- Extra columns can still be added later from Instellingen.

do $$
declare
  canonical text[] := array[
    'Backlog',
    'Deze week / In Progress',
    'Volgende week',
    'Bewaking en beheer',
    'Optimalisaties',
    'Afgerond'
  ];
  i int;
  backlog_id uuid;
begin
  for i in 1 .. array_length(canonical, 1) loop
    insert into public.nh_todo_buckets (name, position)
    select canonical[i], i - 1
    where not exists (
      select 1 from public.nh_todo_buckets where name = canonical[i]
    );
  end loop;

  update public.nh_todos t
  set bucket_id = (
    select id from public.nh_todo_buckets
    where name = 'Deze week / In Progress'
    order by created_at, id
    limit 1
  )
  where t.bucket_id in (
    select id from public.nh_todo_buckets where name = 'Deze week'
  );

  update public.nh_todos t
  set bucket_id = k.keeper_id
  from (
    select
      id as old_id,
      first_value(id) over (partition by name order by created_at, id) as keeper_id
    from public.nh_todo_buckets
  ) k
  where t.bucket_id = k.old_id
    and k.old_id is distinct from k.keeper_id;

  delete from public.nh_todo_buckets b
  using (
    select id, row_number() over (partition by name order by created_at, id) as rn
    from public.nh_todo_buckets
  ) d
  where b.id = d.id and d.rn > 1;

  select id into backlog_id
  from public.nh_todo_buckets
  where name = 'Backlog'
  order by created_at, id
  limit 1;

  update public.nh_todos t
  set bucket_id = backlog_id
  where t.bucket_id in (
    select id from public.nh_todo_buckets
    where name <> all (canonical)
  );

  delete from public.nh_todo_buckets
  where name <> all (canonical);

  update public.nh_todos
  set bucket_id = backlog_id
  where bucket_id is null;

  for i in 1 .. array_length(canonical, 1) loop
    update public.nh_todo_buckets
    set position = i - 1
    where name = canonical[i];
  end loop;
end $$;
