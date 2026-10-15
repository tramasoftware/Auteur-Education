-- Google sends a full name and a picture, not separate given and family names.
-- The picture is a display URL. It is not used for authorization.

alter table public.profiles add column avatar_url text;

alter table public.profiles
  add constraint profiles_avatar_https
    check (
      avatar_url is null
      or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500)
    );

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full text := nullif(btrim(coalesce(meta->>'full_name', meta->>'name')), '');
  v_first text := nullif(btrim(meta->>'first_name'), '');
  v_last text := nullif(btrim(meta->>'last_name'), '');
  v_avatar text := nullif(btrim(coalesce(meta->>'avatar_url', meta->>'picture')), '');
  v_birth date := null;
  v_gender text := nullif(meta->>'gender', '');
begin
  if v_first is null and v_full is not null then
    v_first := split_part(v_full, ' ', 1);
    if position(' ' in v_full) > 0 then
      v_last := coalesce(v_last, nullif(btrim(substr(v_full, position(' ' in v_full) + 1)), ''));
    end if;
  end if;
  if v_first is not null and char_length(v_first) > 80 then
    v_first := left(v_first, 80);
  end if;
  if v_last is not null and char_length(v_last) > 80 then
    v_last := left(v_last, 80);
  end if;
  if v_avatar is null
     or v_avatar !~ '^https://'
     or char_length(v_avatar) > 500 then
    v_avatar := null;
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

  insert into public.profiles (id, first_name, last_name, birth_date, gender, avatar_url)
  values (new.id, v_first, v_last, v_birth, v_gender, v_avatar)
  on conflict (id) do update
    set first_name = coalesce(profiles.first_name, excluded.first_name),
        last_name = coalesce(profiles.last_name, excluded.last_name),
        birth_date = coalesce(profiles.birth_date, excluded.birth_date),
        gender = coalesce(profiles.gender, excluded.gender),
        avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url),
        updated_at = now();
  return new;
end;
$$;

update public.profiles as profile
set
  first_name = coalesce(
    profile.first_name,
    nullif(split_part(source.full_name, ' ', 1), '')
  ),
  last_name = coalesce(
    profile.last_name,
    nullif(btrim(substr(source.full_name, length(split_part(source.full_name, ' ', 1)) + 1)), '')
  ),
  avatar_url = coalesce(profile.avatar_url, source.avatar_url),
  updated_at = now()
from (
  select
    id,
    nullif(btrim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')), '') as full_name,
    case
      when coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture') ~ '^https://'
       and char_length(coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')) <= 500
      then coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture')
      else null
    end as avatar_url
  from auth.users
) as source
where profile.id = source.id
  and (
    profile.first_name is null
    or profile.avatar_url is null
  );
