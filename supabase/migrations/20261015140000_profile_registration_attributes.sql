-- Registration attributes. Nullable because an anonymous visitor has a profile
-- before they create an account. These fields are not used for authorization.

alter table public.profiles
  add column first_name text,
  add column last_name text,
  add column age smallint,
  add column gender text;

alter table public.profiles
  add constraint profiles_first_name_len
    check (first_name is null or char_length(first_name) between 1 and 80),
  add constraint profiles_last_name_len
    check (last_name is null or char_length(last_name) between 1 and 80),
  add constraint profiles_age_range
    check (age is null or age between 13 and 120),
  add constraint profiles_gender_known
    check (gender is null or gender in ('female', 'male', 'nonbinary', 'undisclosed'));

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
  v_age integer := null;
  v_gender text := nullif(meta->>'gender', '');
begin
  if v_first is not null and char_length(v_first) > 80 then
    raise exception 'invalid profile';
  end if;
  if v_last is not null and char_length(v_last) > 80 then
    raise exception 'invalid profile';
  end if;
  if meta ? 'age' and nullif(meta->>'age', '') is not null then
    if meta->>'age' !~ '^[0-9]+$' then
      raise exception 'invalid profile';
    end if;
    v_age := (meta->>'age')::integer;
    if v_age < 13 or v_age > 120 then
      raise exception 'invalid profile';
    end if;
  end if;
  if v_gender is not null and v_gender not in ('female', 'male', 'nonbinary', 'undisclosed') then
    raise exception 'invalid profile';
  end if;

  insert into public.profiles (id, first_name, last_name, age, gender)
  values (new.id, v_first, v_last, v_age, v_gender)
  on conflict (id) do update
    set first_name = coalesce(excluded.first_name, profiles.first_name),
        last_name = coalesce(excluded.last_name, profiles.last_name),
        age = coalesce(excluded.age, profiles.age),
        gender = coalesce(excluded.gender, profiles.gender),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row execute function private.handle_new_user();
