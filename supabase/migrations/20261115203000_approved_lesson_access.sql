-- DEC-023: a stored approved lesson can be opened and marked before its module
-- is published. Synthesis and the Knowledge Check stay on the published module.

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
  v_lesson_state text;
  v_has_draft boolean;
  v_current_read boolean;
  v_updated_at timestamptz;
  v_stamp timestamptz;
  v_exists boolean;
begin
  select user_id into v_owner from public.courses where id = p_course_id;
  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select lesson.user_id, lesson.state, lesson.draft is not null
    into v_lesson_owner, v_lesson_state, v_has_draft
  from public.lessons as lesson
  where lesson.id = p_lesson_id
    and lesson.course_id = p_course_id;

  if v_lesson_owner is null or v_lesson_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_lesson_state is distinct from 'approved' or v_has_draft is not true then
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
  v_lesson_state text;
  v_has_draft boolean;
  v_last uuid;
  v_revision bigint;
begin
  select user_id into v_owner from public.courses where id = p_course_id;
  if v_owner is null or v_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select lesson.user_id, lesson.state, lesson.draft is not null
    into v_lesson_owner, v_lesson_state, v_has_draft
  from public.lessons as lesson
  where lesson.id = p_lesson_id
    and lesson.course_id = p_course_id;

  if v_lesson_owner is null or v_lesson_owner <> p_user_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_lesson_state is distinct from 'approved' or v_has_draft is not true then
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
