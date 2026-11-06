-- Learner progress (BR-PRG-001..005). Separate from courses.completed_at, which
-- records the end of generation. Rules mirror
-- apps/api/src/auteur_api/modules/learning_progress/logic.py.

create table public.lesson_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  read boolean not null,
  marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  constraint lesson_reads_mark_check check (
    (read and marked_at is not null) or (not read and marked_at is null)
  )
);

create index lesson_reads_user_course_idx
  on public.lesson_reads (user_id, course_id);

create table public.course_learning_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  last_lesson_id uuid references public.lessons (id) on delete set null,
  last_activity_at timestamptz,
  position_revision bigint not null default 0,
  first_completed_at timestamptz,
  current_completed_at timestamptz,
  synthesis_auto_presented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id),
  constraint course_learning_progress_revision_check check (position_revision >= 0)
);

create trigger course_learning_progress_set_updated_at
  before update on public.course_learning_progress
  for each row execute function public.set_updated_at();

alter table public.lesson_reads enable row level security;
alter table public.course_learning_progress enable row level security;

revoke all on table public.lesson_reads from public, anon, authenticated;
revoke all on table public.course_learning_progress from public, anon, authenticated;

create policy lesson_reads_select_own on public.lesson_reads
  for select to authenticated using (user_id = (select auth.uid()));
create policy lesson_reads_insert_own on public.lesson_reads
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy lesson_reads_update_own on public.lesson_reads
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy course_learning_progress_select_own on public.course_learning_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy course_learning_progress_insert_own on public.course_learning_progress
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy course_learning_progress_update_own on public.course_learning_progress
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy lesson_reads_block_anonymous
  on public.lesson_reads
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true');

create policy course_learning_progress_block_anonymous
  on public.course_learning_progress
  as restrictive
  for all
  to authenticated
  using ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true')
  with check ((select auth.jwt() ->> 'is_anonymous') is distinct from 'true');

-- Serializes marks, visits, and completion repairs for one learner and course.
create or replace function public.lock_learning_progress(
  p_user_id uuid,
  p_course_id uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_course_id::text, 0)
  );
end;
$$;

create or replace function public.reconcile_course_learning(
  p_user_id uuid,
  p_course_id uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_state text;
  v_lesson_total int;
  v_lessons_read int;
  v_all_published boolean;
  v_completed boolean;
  v_changed boolean := false;
begin
  select user_id, state
    into v_owner, v_state
  from public.courses
  where id = p_course_id;

  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  perform public.lock_learning_progress(p_user_id, p_course_id);

  select count(*)
    into v_lesson_total
  from public.lessons
  where course_id = p_course_id;

  select count(*)
    into v_lessons_read
  from public.lessons as lesson
  join public.modules as module on module.id = lesson.module_id
  join public.lesson_reads as mark
    on mark.lesson_id = lesson.id
   and mark.user_id = p_user_id
   and mark.read
  where lesson.course_id = p_course_id
    and module.state = 'published';

  select not exists (
    select 1
    from public.modules
    where course_id = p_course_id
      and state <> 'published'
  )
    into v_all_published;

  v_completed :=
    v_state = 'complete'
    and v_lesson_total > 0
    and v_lessons_read = v_lesson_total
    and v_all_published;

  if v_completed then
    insert into public.course_learning_progress (
      user_id,
      course_id,
      first_completed_at,
      current_completed_at
    )
    values (p_user_id, p_course_id, now(), now())
    on conflict (user_id, course_id) do update
      set first_completed_at = coalesce(
            course_learning_progress.first_completed_at,
            excluded.first_completed_at
          ),
          current_completed_at = coalesce(
            course_learning_progress.current_completed_at,
            excluded.current_completed_at
          )
      where course_learning_progress.first_completed_at is null
         or course_learning_progress.current_completed_at is null;
    v_changed := found;
  else
    update public.course_learning_progress
      set current_completed_at = null
    where user_id = p_user_id
      and course_id = p_course_id
      and current_completed_at is not null;
    v_changed := found;
  end if;

  return jsonb_build_object(
    'outcome',
    case when v_changed then 'reconciled' else 'unchanged' end
  );
end;
$$;

create or replace function public.apply_lesson_read(
  p_user_id uuid,
  p_course_id uuid,
  p_lesson_id uuid,
  p_read boolean,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_lesson_owner uuid;
  v_module_state text;
  v_current_read boolean;
  v_updated_at timestamptz;
  v_stamp timestamptz;
  v_exists boolean;
begin
  select user_id into v_owner from public.courses where id = p_course_id;
  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select lesson.user_id, module.state
    into v_lesson_owner, v_module_state
  from public.lessons as lesson
  join public.modules as module on module.id = lesson.module_id
  where lesson.id = p_lesson_id
    and lesson.course_id = p_course_id;

  if v_lesson_owner is null or v_lesson_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_module_state <> 'published' then
    return jsonb_build_object('outcome', 'not_accessible');
  end if;

  perform public.lock_learning_progress(p_user_id, p_course_id);

  select mark.read, mark.updated_at
    into v_current_read, v_updated_at
  from public.lesson_reads as mark
  where mark.user_id = p_user_id
    and mark.lesson_id = p_lesson_id
  for update;
  v_exists := found;

  if (v_exists and v_current_read = p_read) or (not v_exists and not p_read) then
    return jsonb_build_object('outcome', 'unchanged');
  end if;

  if v_exists then
    if p_expected_updated_at is distinct from v_updated_at then
      return jsonb_build_object('outcome', 'stale');
    end if;
    v_stamp := clock_timestamp();
    if v_stamp <= v_updated_at then
      v_stamp := v_updated_at + interval '1 microsecond';
    end if;
    update public.lesson_reads
      set read = p_read,
          marked_at = case when p_read then v_stamp else null end,
          updated_at = v_stamp
    where user_id = p_user_id
      and lesson_id = p_lesson_id;
  else
    if p_expected_updated_at is not null then
      return jsonb_build_object('outcome', 'stale');
    end if;
    insert into public.lesson_reads (
      user_id, lesson_id, course_id, read, marked_at, updated_at
    )
    values (
      p_user_id, p_lesson_id, p_course_id, true, clock_timestamp(), clock_timestamp()
    );
  end if;

  insert into public.course_learning_progress (user_id, course_id, last_activity_at)
  values (p_user_id, p_course_id, now())
  on conflict (user_id, course_id) do update
    set last_activity_at = excluded.last_activity_at;

  perform public.reconcile_course_learning(p_user_id, p_course_id);
  return jsonb_build_object('outcome', 'applied');
end;
$$;

create or replace function public.record_lesson_visit(
  p_user_id uuid,
  p_course_id uuid,
  p_lesson_id uuid,
  p_position_revision bigint
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_lesson_owner uuid;
  v_module_state text;
  v_last uuid;
  v_revision bigint;
begin
  select user_id into v_owner from public.courses where id = p_course_id;
  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select lesson.user_id, module.state
    into v_lesson_owner, v_module_state
  from public.lessons as lesson
  join public.modules as module on module.id = lesson.module_id
  where lesson.id = p_lesson_id
    and lesson.course_id = p_course_id;

  if v_lesson_owner is null or v_lesson_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_module_state <> 'published' then
    return jsonb_build_object('outcome', 'not_accessible');
  end if;

  perform public.lock_learning_progress(p_user_id, p_course_id);

  insert into public.course_learning_progress (user_id, course_id)
  values (p_user_id, p_course_id)
  on conflict (user_id, course_id) do nothing;

  select last_lesson_id, position_revision
    into v_last, v_revision
  from public.course_learning_progress
  where user_id = p_user_id
    and course_id = p_course_id
  for update;

  if v_last = p_lesson_id then
    update public.course_learning_progress
      set last_activity_at = now()
    where user_id = p_user_id
      and course_id = p_course_id;
    return jsonb_build_object('outcome', 'unchanged');
  end if;

  if v_revision is distinct from p_position_revision then
    return jsonb_build_object('outcome', 'stale');
  end if;

  update public.course_learning_progress
    set last_lesson_id = p_lesson_id,
        last_activity_at = now(),
        position_revision = position_revision + 1
  where user_id = p_user_id
    and course_id = p_course_id;

  return jsonb_build_object('outcome', 'applied');
end;
$$;

create or replace function public.record_synthesis_presentation(
  p_user_id uuid,
  p_course_id uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_owner uuid;
  v_first timestamptz;
  v_presented timestamptz;
begin
  select user_id into v_owner from public.courses where id = p_course_id;
  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  perform public.lock_learning_progress(p_user_id, p_course_id);

  select first_completed_at, synthesis_auto_presented_at
    into v_first, v_presented
  from public.course_learning_progress
  where user_id = p_user_id
    and course_id = p_course_id
  for update;

  if not found or v_first is null then
    return jsonb_build_object('outcome', 'not_ready');
  end if;

  if v_presented is not null then
    return jsonb_build_object('outcome', 'unchanged');
  end if;

  update public.course_learning_progress
    set synthesis_auto_presented_at = now()
  where user_id = p_user_id
    and course_id = p_course_id;

  return jsonb_build_object('outcome', 'applied');
end;
$$;

revoke all on function public.lock_learning_progress(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_course_learning(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_lesson_read(uuid, uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
revoke all on function public.record_lesson_visit(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
revoke all on function public.record_synthesis_presentation(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.lock_learning_progress(uuid, uuid) to service_role;
grant execute on function public.reconcile_course_learning(uuid, uuid) to service_role;
grant execute on function public.apply_lesson_read(uuid, uuid, uuid, boolean, timestamptz)
  to service_role;
grant execute on function public.record_lesson_visit(uuid, uuid, uuid, bigint)
  to service_role;
grant execute on function public.record_synthesis_presentation(uuid, uuid)
  to service_role;
