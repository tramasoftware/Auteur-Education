-- Login routes new members to onboarding without listing courses (DEC-018).

alter table public.profiles
  add column generated_course_count integer not null default 0;

alter table public.profiles
  add constraint profiles_generated_course_count_check
  check (generated_course_count >= 0);

alter table public.profiles disable trigger profiles_set_updated_at;

update public.profiles as profile
set generated_course_count = (
  select count(*)::integer
  from public.courses as course
  where course.user_id = profile.id
);

alter table public.profiles enable trigger profiles_set_updated_at;

create or replace function private.touch_generated_course_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
    set generated_course_count = generated_course_count + 1
    where id = new.user_id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    update public.profiles
    set generated_course_count = greatest(generated_course_count - 1, 0)
    where id = old.user_id;
    return old;
  end if;

  if new.user_id is distinct from old.user_id then
    update public.profiles
    set generated_course_count = greatest(generated_course_count - 1, 0)
    where id = old.user_id;
    update public.profiles
    set generated_course_count = generated_course_count + 1
    where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists courses_generated_course_count on public.courses;
create trigger courses_generated_course_count
after insert or delete or update of user_id on public.courses
for each row execute function private.touch_generated_course_count();
