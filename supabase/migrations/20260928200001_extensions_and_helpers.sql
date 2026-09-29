-- pgcrypto is used when seeding the demo auth user.
create extension if not exists pgcrypto with schema extensions;

-- Helpers for generated timestamps. uuid is built-in on Postgres 13+.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
