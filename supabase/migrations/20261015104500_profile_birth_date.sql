-- Date of birth replaces the age integer. The 13-to-120-year window is
-- checked in the trigger because a check constraint cannot use today's date.

alter table public.profiles drop constraint if exists profiles_age_range;
alter table public.profiles drop column if exists age;
alter table public.profiles add column birth_date date;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text := nullif(btrim(meta->>'first_name'), '');
  v_last text := nullif(btrim(meta->>'last_name'), '');
  v_birth date := null;
  v_gender text := nullif(meta->>'gender', '');
begin
  if v_first is not null and char_length(v_first) > 80 then
    raise exception 'invalid profile';
  end if;
  if v_last is not null and char_length(v_last) > 80 then
    raise exception 'invalid profile';
  end if;
  if meta ? 'birth_date' and nullif(meta->>'birth_date', '') is not null then
    begin
      v_birth := (meta->>'birth_date')::date;
    exception
      when others then
        raise exception 'invalid profile';
    end;
    if v_birth > (current_date - interval '13 years')::date
       or v_birth < (current_date - interval '120 years')::date then
      raise exception 'invalid profile';
    end if;
  end if;
  if v_gender is not null and v_gender not in ('female', 'male', 'nonbinary', 'undisclosed') then
    raise exception 'invalid profile';
  end if;

  insert into public.profiles (id, first_name, last_name, birth_date, gender)
  values (new.id, v_first, v_last, v_birth, v_gender)
  on conflict (id) do update
    set first_name = coalesce(excluded.first_name, profiles.first_name),
        last_name = coalesce(excluded.last_name, profiles.last_name),
        birth_date = coalesce(excluded.birth_date, profiles.birth_date),
        gender = coalesce(excluded.gender, profiles.gender),
        updated_at = now();
  return new;
end;
$$;
